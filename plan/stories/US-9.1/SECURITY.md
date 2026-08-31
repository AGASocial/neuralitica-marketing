# Security Design Review — US-9.1

**Story:** US-9.1 — Assemble final 9:16 Reel  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-9.1 AC + `[SEC]`), `plan/stories/US-9.1/README.md`, `TASKS.md`, `plan/SECURITY_BASELINE.md` (FFmpeg / SSRF / provider boundary), `plan/stories/US-8.4/SECURITY.md` (job status write authority, IDOR 404, worker poll pattern), `plan/stories/US-9.3/SECURITY.md` (pointer-only orchestrator input, media serve ownership), `plan/stories/US-8.2/SECURITY.md` (download-and-own, storage key validation), `plan/stories/US-14.5/CONTRACT.md` (`requireOperator`), `docs/adr/0003-worker-flyio-ffmpeg.md`, `lib/video-jobs/enqueue-video-job-poll.ts`, `worker/video-jobs.ts`, `app/api/media/assets/[assetId]/route.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **media-pipeline-engineer** (FFmpeg args builders, `runAssemblyJob`, Fly worker loop). **nextjs-backend** (DDL, orchestrator, Route Handler, Server Action, CONTRACT). **nextjs-frontend** (Operator status/preview UI — no FFmpeg or path authority).

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: **Operator-gated** assemble trigger with **pointer-only input** `{ reelScriptId }`; **server-resolved** primary video + voiceover asset FKs after **ownership verification**; **Fly worker** (ADR-0003) runs FFmpeg via **`spawn('ffmpeg', args[])`** on **local temp files** downloaded from **Supabase Storage** (service-role) — **never** shell interpolation, **never** assembly-time HTTP fetch of client or vendor URLs; **worker-only** status transitions on **`neuramark_assembled_reels`**; **idempotent** completed row per **`(reel_script_id, script_updated_at, input_fingerprint)`** scoped by **`client_id`**; **ownership-checked** serve for **`assembled_reel`** output via existing media Route Handler.

No REDESIGN. No veto of PO lean defaults (Phase A talking-head + manual primary only; single template `reel_v1_basic`; V1 Operator-only trigger and preview serve; dev `ASSEMBLY_JOB_POLL_MODE=in_process` seam mirroring video jobs; hardcoded local Operator OK until auth universal). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-8.4 / US-9.3 / US-8.2 / US-14.5 / SECURITY_BASELINE — do not weaken):** `requireOperator()` calls `requireActive()` first; role and `client_id` never from request; handler-level gates mandatory; foreign UUID → **404** (not 403); RLS deny-by-default on `neuramark_assembled_reels` and `neuramark_media_assets`; service-role Node only; no `@supabase/supabase-js` in Client Components; download-and-own storage keys (no canonical third-party URLs); interim hardcoded user is sanctioned — not a finding.

**This story owns:** **`neuramark_assembled_reels`** migration + server writes; **`createAssemblyJobForReelScript()`** orchestrator; **`assembleReelForScript`** Server Action; **`GET /api/assembly-jobs/[jobId]`**; **`lib/assembly/**`** FFmpeg + worker modules; **`worker/assembly-jobs.ts`**; extend **`neuramark_media_asset_type`** with **`assembled_reel`**; extend media serve route; **`findForbiddenAssemblyKeys`**; idempotency + tenancy tests; security tests for injection, IDOR, SSRF, forbidden trigger fields, worker tenancy.

**This story does not own:** Subtitles/logo/cover FFmpeg pass (US-9.2 — drawtext/subtitle injection surface); Wan B-roll adapter (US-8.5); QA agent (US-10.1); Cliente approval preview auth widening (US-11.1 may widen serve later); weekly cycle auto-assemble cron (integrations-engineer); assembly spend ledger (US-7.3 Phase B — V1 `$0` or omit); auth redesign; M1 **`/api/media/provider-assets`** HMAC route (vendor-facing — **not applicable** to assembly worker; see Worker auth below).

**Terminology:** **Ensamblado** · **download-and-own** · **Reel 9:16** · **Paquete de guion**. Technical names `createAssemblyJobForReelScript`, `input_fingerprint`, `buildReelV1BasicArgs`, `requireOperator` are canonical. Do not expose FFmpeg command strings, `storage_key`, or temp paths in Operator DTOs.

---

### Threat Summary (US-9.1–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **FFmpeg command injection** | RCE on Fly worker via shell metacharacters or filtergraph options | **`spawn('ffmpeg', args[])`** only — **no** `exec`, `execSync`, or shell string. Phase A filter graph built from **numeric** duration/tolerance + **fixed template constants** — **no** script text, filenames, or subtitle strings in `-vf`/`-filter_complex`. Args builder is pure function with unit tests |
| **Path traversal via storage keys or temp paths** | Read/write arbitrary filesystem paths | Inputs: load `storage_key` from **`neuramark_media_assets`** after ownership check; validate against **frozen regex** (CONTRACT) before Storage read. Temp dir **`/tmp/neuramark-assembly/{assemblyJobId}/`** where `assemblyJobId` is server UUID from DB row — **never** concatenate user/script text into paths. Output filename server-generated inside temp dir |
| **SSRF at assembly time** | Worker fetches internal/metadata URLs | **No HTTP(S) fetch** of asset bytes at assembly. Worker downloads via **Supabase Storage SDK** (service-role) using validated `storage_key` only. **Forbidden:** `fetch(assetUrl)`, provider URLs, M1 signed URLs, or client-supplied URLs in assembly path |
| **Client-supplied asset / template IDs** | Cross-tenant input swap or wrong template | Trigger input **`{ reelScriptId }` only**. Orchestrator resolves **`primary_video_asset_id`** + **`voiceover_asset_id`** server-side. Reject **`primaryVideoAssetId`**, **`voiceoverAssetId`**, **`templateId`**, **`clientId`**, URLs, **`status`** → **`FORBIDDEN_FIELDS`** |
| **IDOR on assembly job poll** | Operator reads another tenant's assembly progress/failure | **`GET /api/assembly-jobs/[jobId]`**: `requireOperator` → load **`WHERE id = $1 AND client_id = $2`** with server-resolved tenant. Foreign id → **404**. DTO excludes FFmpeg args, `storage_key`, internal paths |
| **IDOR on assembled output serve** | Cross-tenant MP4 leak | Extend **`GET /api/media/assets/[assetId]`** for `asset_type = assembled_reel`: **`requireOperator("handler")`** + **`row.client_id === operator.id`** → else **404**. V1 Operator-only (mirror `generated_video` / `voiceover`) |
| **Client status manipulation** | Forge `completed` without FFmpeg run | **No** browser-callable endpoint UPDATEs assembly `status`, `output_media_asset_id`, or `failure_reason`. Writes only in **`import "server-only"`** modules under **`lib/assembly/**`** invoked by worker / dev in-process seam |
| **Worker cross-tenant asset mix** | Job for client A assembled with client B's primary MP4 | Before FFmpeg: verify **`primary_video_asset_id`** and **`voiceover_asset_id`** (if set) rows have **`client_id === job.client_id`**. Reject job → `failed` + sanitized reason — **no** FFmpeg spawn. Worker re-checks on run (orchestrator already verified at enqueue) |
| **Cliente triggers assembly** | Unauthorized compute / pipeline advance | **`assembleReelForScript`** / **`createAssemblyJobForReelScript`**: **`requireOperator("handler")`** as **first** await → Cliente **403**, no INSERT |
| **Idempotency race / duplicate outputs** | Double FFmpeg spend, orphaned assets | Unique partial index or app-level guard on **completed** `(reel_script_id, script_updated_at, input_fingerprint)`; concurrent triggers → one winner, others return existing completed row or block on in-flight row (CONTRACT freezes). Terminal **`completed`** sticky |
| **Stale timeout as client trigger** | Client forces fail/success | **`markStaleAssemblyJobsFailed()`** runs **only** in worker loop comparing `updated_at` to **`NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN`** — not client-callable |
| **Over-exposure in assembly DTO** | Leak storage keys, FFmpeg command, paths | Operator DTO: status, durations, asset ids for preview linkage, sanitized `failureReason` — **no** `storage_key`, `ffmpegArgs`, temp paths, or raw stderr |
| **Phase B injection** | `cold_open_notes` / B-roll paths become text injection | **See Phase B section below** — numeric trim only; server-resolved broll ids; concat args-array + owned assets only |

**Residual risk accepted:** Operator trust — Operator can assemble for server-resolved client (V1: self). Compromise of Fly worker env or service-role key is ops-level blast radius (same as US-8.4 poller). FFmpeg parsing malicious MP4 is a supply-chain concern bounded by owned assets only. UUID guessing against uniform 404 is low sensitivity. Cliente preview of assembled Reel at approval (US-11.1) may require widening media serve auth — defer; V1 Operator-only serve is acceptable. Phase B B-roll stitch adds concat surface — same args-array + ownership floors apply when implemented.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Input MP4 / audio bytes (`generated_video`, `voiceover`) | **High** — tenant likeness/content | Loaded from **`neuramark_media_assets`** via Storage SDK after **`client_id`** match |
| FFmpeg worker process (Fly) | **High** — RCE surface if injection | Trusted server process; untrusted input = **file bytes only**, not CLI strings from users |
| `neuramark_assembled_reels` rows | **High** — production gate input | Service-role writes; status mutations **worker modules only** |
| Output `assembled_reel` MP4 | **High** — pre-QA/publish content | Server-generated `storage_key`; ownership-checked serve |
| `storage_key` values | **High** — path traversal vector | Regex-validated at INSERT and before worker read |
| Operator assembly status DTO | Medium | Sanitized; no paths or commands |
| Supabase service-role key (worker) | **Critical** | Fly env only; never Vercel client bundle or browser |

**Boundaries:**

1. **Browser (Operator) → `assembleReelForScript`** — Untrusted. Sends **`reelScriptId`** only. **`requireOperator("handler")` first**. No asset ids, template, URLs, or status fields.
2. **Browser (Operator) → `GET /api/assembly-jobs/[jobId]`** — Untrusted. Read-only. Session → server `client_id` → scoped SELECT → minimal DTO.
3. **Browser (Operator) → `GET /api/media/assets/[assetId]`** (`assembled_reel`) — Session + ownership match; **404** on foreign id.
4. **Vercel orchestrator → Postgres INSERT + enqueue** — Resolves inputs, verifies ownership, computes fingerprint, idempotency check, INSERT `queued` — **no FFmpeg on Vercel** (ADR-0003).
5. **Fly worker → Storage download → local temp → FFmpeg → Storage upload → Postgres UPDATE** — Trusted process. **Storage SDK only** — no outbound URL fetch for inputs. Status writes via **`applyAssemblyJobUpdate`** (or CONTRACT-exact single applier).
6. **Dev `in_process` seam** — Same **`lib/assembly/run-assembly-job.ts`** code path in Node; same tenancy and spawn rules — not a security bypass.

**Worker auth (M1 HMAC — applicability):** The **M1 HMAC** pattern (`/api/media/provider-assets/[assetId]`, `NEURAMARK_PROVIDER_ASSET_URL_SECRET`) exists so **external vendors** (Replicate) can GET tenant assets **without session cookies**. The assembly worker is an **internal trusted process** with **service-role Supabase + Storage SDK** — it **does not** use M1 URLs and **must not** add a new unauthenticated HTTP asset route for worker input. Worker authenticity = **Fly deployment isolation + service-role secret rotation**, not HMAC query params. If a future design adds **HTTP-triggered** worker endpoints (not in PO scope), those would require separate shared-secret auth — **out of US-9.1 V1**.

---

## Abuse Cases Considered

- *As a malicious actor, I POST `{ primaryVideoAssetId: "<victim-uuid>" }` on assemble* → **Blocked:** forbidden field; orchestrator resolves primary from latest completed video job for owned script only.
- *As a malicious actor, I POST `{ templateId: "evil; rm -rf /" }`* → **Blocked:** forbidden field; server freezes **`reel_v1_basic`**.
- *As a malicious actor, I POST `{ reelScriptId: "<victim-uuid>" }` as Operator for another tenant* → **Blocked:** script load **`WHERE id = $1 AND client_id = $serverClientId`**; foreign → **404** (V1 operator tenant = self).
- *As a Cliente, I call `assembleReelForScript`* → **Blocked:** **`requireOperator`** → **403**.
- *As a malicious actor, I PATCH assembly job status to `completed`* → **Blocked:** no client mutation Route Handler; grep CI for UPDATE outside `lib/assembly/**`.
- *As a malicious actor, I poll `GET /api/assembly-jobs/[victimJobId]`* → **Blocked:** **`client_id`** predicate; foreign → **404**.
- *As a malicious actor, I read victim assembled MP4 via asset UUID* → **Blocked:** serve route **`requireOperator`** + **`client_id`** match → **404**.
- *As a malicious actor, I smuggle `../../etc/passwd` via storage_key in a crafted asset row* → **Blocked:** regex CHECK on INSERT; worker rejects keys not matching pattern before read.
- *As a malicious actor, I inject FFmpeg options via script `voiceover_text` or `cold_open_notes`* → **Blocked Phase A:** no script text in FFmpeg args. **Phase B:** numeric trim seconds only — never raw notes string in CLI.
- *As a malicious actor, I pass a signed M1 or provider URL into the worker* → **Blocked:** assembly path has **no URL input parameter**; worker reads Storage by key only.
- *As a malicious actor, I trigger duplicate assemblies to exhaust Fly CPU* → **Bounded:** idempotency returns existing completed row; Operator-only trigger; stale marks failed jobs worker-side.
- *As a malicious actor, I enqueue assembly without completed primary video* → **Blocked:** **`ASSEMBLY_INPUTS_INCOMPLETE`** before INSERT or before worker spawn (CONTRACT gate order).

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-9.1 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent job / media / auth paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on `neuramark_assembled_reels` and `neuramark_media_assets`; privileged access via Node service-role only *(US-14.5)*
- [ ] **[SEC] Service-role key is used only from Node server modules and Fly worker** — never Client Components, never Edge middleware *(US-14.5 / ADR-0003)*
- [ ] **[SEC] Download-and-own:** canonical assembly output is **`neuramark_media_assets.storage_key`** — no long-lived third-party URL columns *(SECURITY_BASELINE / US-8.2)*

**US-9.1 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] FFmpeg (or the assembly service) is invoked with argument arrays, never shell string interpolation; all input paths come from validated `media_assets` records owned by the job's client, and text inputs (subtitles, filenames) cannot inject FFmpeg options or shell metacharacters** *(USER_STORIES US-9.1)*
- [ ] **[SEC] Assembly only consumes assets already stored by the system; it never fetches arbitrary URLs supplied at assembly time (SSRF guard)** *(USER_STORIES US-9.1)*

**Added in this review (binding for US-9.1 BUILD):**

- [ ] **[SEC] (added) Trigger input schema accepts `{ reelScriptId: uuid }` only.** Reject (forbidden fields): `primaryVideoAssetId`, `primary_video_asset_id`, `voiceoverAssetId`, `voiceover_asset_id`, `templateId`, `template_id`, `clientId`, `client_id`, `status`, `outputMediaAssetId`, `inputFingerprint`, `scriptUpdatedAt`, `force`, `skipIdempotency`, any URL field → **`FORBIDDEN_FIELDS`**. Implement **`findForbiddenAssemblyKeys`** mirroring video-job pattern
- [ ] **[SEC] (added) `assembleReelForScript` / `createAssemblyJobForReelScript` calls `requireOperator("handler")` as first await** before script load, input resolution, INSERT, or enqueue. Cliente/unauthenticated → **403** / **401**, no side effects
- [ ] **[SEC] (added) Script tenancy:** load **`neuramark_reel_scripts`** with **`WHERE id = $reelScriptId AND client_id = $serverClientId`**. Foreign/missing → **404** uniform envelope
- [ ] **[SEC] (added) Input resolution is server-only:** latest **completed** primary video job for script → `primary_video_asset_id`; optional latest **`voiceover`** asset for fingerprint/remux edge. **Never** accept asset ids from client. Primary job must belong to same **`client_id`** and script
- [ ] **[SEC] (added) Asset ownership verification before enqueue and before FFmpeg:** for each input asset id, **`SELECT … WHERE id = $1 AND client_id = $jobClientId`**. Mismatch → **`ASSEMBLY_INPUTS_INCOMPLETE`** or job **`failed`** with sanitized code — **no** Storage read, **no** spawn
- [ ] **[SEC] (added) `storage_key` validation:** worker and insert helpers reject keys not matching CONTRACT-frozen regex (assembled output: **`neuramark/{clientId}/{reelScriptId}/assembled-{uuid}.mp4`** pattern). Reject `..`, absolute paths, and scheme-prefixed strings
- [ ] **[SEC] (added) FFmpeg invocation:** **`child_process.spawn('ffmpeg', args, { shell: false })`** (or equivalent — **shell must be false**). Args from **`buildReelV1BasicArgs()`** pure function only. Phase A: **no** `-drawtext`, **no** subtitle file paths, **no** user filenames in args. Unit-test golden snapshots for args array
- [ ] **[SEC] (added) Temp workspace isolation:** create **`/tmp/neuramark-assembly/{assemblyJobId}/`** using UUID from DB; download inputs to fixed basenames (`primary.mp4`, `voiceover.mp3`, `output.mp4`); **`finally`** block deletes temp tree. Never use `storage_key` or original filename as path segment
- [ ] **[SEC] (added) No HTTP URL fetch in assembly path:** grep/test assert **`lib/assembly/**`** does not call `fetch(` for asset bytes. Storage reads via injected **`getMediaStorage()`** / Supabase SDK only
- [ ] **[SEC] (added) Closed status write surface:** the **only** modules that UPDATE `neuramark_assembled_reels.status`, `output_media_asset_id`, `actual_duration_sec`, or `failure_reason` are **`import "server-only"`** under **`lib/assembly/**`** (shared **`applyAssemblyJobUpdate`** or CONTRACT exact). **Zero** Server Actions / Route Handlers mutate assembly status from request body
- [ ] **[SEC] (added) `GET /api/assembly-jobs/[jobId]` is GET-only** with **`requireOperator("handler")`** and **`WHERE id = $1 AND client_id = $2`**. Foreign → **404**. Response = **`operatorAssemblyJobDtoSchema`** — strict subset: no `storage_key`, no FFmpeg args, no stderr
- [ ] **[SEC] (added) Media serve extension for `assembled_reel`:** UUID validation; **`requireOperator("handler")`**; **`row.client_id === operator.id`** else **404**; video MIME allowlist (`video/mp4`); **`Cache-Control: private, no-store`**; sanitize **`Content-Disposition`** filename. Do not serve `assembled_reel` on unauthenticated or Cliente session in V1
- [ ] **[SEC] (added) Idempotency + tenancy:** **`client_id`** on every `neuramark_assembled_reels` row; completed uniqueness on **`(reel_script_id, script_updated_at, input_fingerprint)`** scoped to tenant (partial unique index or equivalent). Re-assemble with unchanged triple returns existing completed row — no second FFmpeg. **`input_fingerprint`** computed server-side only
- [ ] **[SEC] (added) Worker job claim:** worker SELECTs **`queued`** rows with **`FOR UPDATE SKIP LOCKED`** (or CONTRACT-equivalent) to prevent double FFmpeg on same row. Re-verify input asset **`client_id`** inside **`runAssemblyJob`** before download
- [ ] **[SEC] (added) Stale assembly timeout worker-only:** **`markStaleAssemblyJobsFailed()`** in worker loop — `status IN ('queued','processing') AND updated_at < now() - NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN`. Sets **`failed`** + sanitized **`failure_reason`**. Not client-triggered
- [ ] **[SEC] (added) `enqueueAssemblyJob` dev seam mirrors video jobs:** when **`ASSEMBLY_JOB_POLL_MODE=in_process`**, fire-and-forget **`runAssemblyJob`** in Node; when **`fly`**, no-op on Vercel — Fly worker polls DB. Seam must **not** skip ownership or spawn guards
- [ ] **[SEC] (added) Do not log FFmpeg full stderr, `storage_key`, or binary paths in production** — job id, status, duration, error code only
- [ ] **[SEC] (added) Automated security tests cover at least:** forbidden asset/template fields rejected; Cliente **403** on assemble; foreign `reelScriptId` **404**; foreign assembly job id **404**; foreign assembled asset serve **404**; args builder contains no shell metacharacters from fixture inputs; mocked spawn receives array not string; grep — no `UPDATE neuramark_assembled_reels` outside `lib/assembly/**`; grep — no `fetch(` for asset download in `lib/assembly/**`; worker rejects cross-tenant asset ids (mock DB)

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Assemble trigger — **Operator + pointer-only input** (APPROVE)

| Rule | Detail |
|---|---|
| Action input | **`{ reelScriptId: uuid }` only** |
| Gate | **`requireOperator("handler")` first** |
| Template | Server constant **`reel_v1_basic`** — no FE picker, no request override |
| Asset ids | Resolved server-side from video job + voiceover lookup |

**Condition:** CONTRACT documents **`findForbiddenAssemblyKeys`** list explicitly.

#### 2. FFmpeg — **args array, no user text Phase A** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Spawn | **`spawn('ffmpeg', args, { shell: false })`** |
| Builder | **`buildReelV1BasicArgs({ localPrimaryPath, localOutputPath, targetDurationSec, toleranceSec })`** → `string[]` |
| Phase A graph | Scale/crop **1080×1920**, **libx264**, **aac**, trim/pad — numeric only |
| Forbidden Phase A | `-drawtext`, `-i` from user strings, filtergraph built from script JSON text |

**Condition:** CONTRACT freezes filter graph constants. Phase B concat module must follow same builder pattern when US-8.5 lands.

#### 3. Storage I/O — **SDK only, validated keys** (APPROVE)

| Rule | Detail |
|---|---|
| Input read | Storage SDK after ownership + regex check |
| Output write | Server-generated key → INSERT `media_assets` → UPDATE job FK |
| SSRF | **No** `fetch(url)` for assembly inputs |

#### 4. Status authority — **worker-only single applier** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Writers | **`runAssemblyJob`**, **`markStaleAssemblyJobsFailed`**, **`applyAssemblyJobUpdate`** only |
| Readers | Operator GET poll + batch map on week load |
| Forbidden | Browser-callable status mutation |
| Idempotency | Terminal **`completed`** sticky; safe duplicate enqueue |

**Condition:** CONTRACT lists allowed transitions: `queued` → `processing` → `completed`|`failed`.

#### 5. IDOR — **404 uniform on foreign ids** (APPROVE)

| Resource | Guard |
|---|---|
| Assembly job GET | `(jobId, client_id)` |
| Assembled media serve | `(assetId, client_id)` + type allowlist |
| Script pointer on assemble | `(reelScriptId, client_id)` |

#### 6. Worker runtime — **ADR-0003, no M1 for inputs** (APPROVE)

| Rule | Detail |
|---|---|
| Vercel | INSERT + enqueue only |
| Fly | Poll + FFmpeg + UPDATE |
| Auth | Service-role; **not** M1 HMAC URLs |
| Tenancy | Re-verify asset `client_id` at run time |

#### 7. Output serve — **Operator V1** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Route | Extend existing **`GET /api/media/assets/[assetId]`** |
| Auth | **`requireOperator`** + ownership |
| Future | US-11.1 may widen Cliente read — additive only |

**Condition:** CONTRACT notes US-11.1 widening is a separate auth change — do not serve `assembled_reel` to Cliente in US-9.1 BUILD.

#### 8. Idempotency key — **server-computed fingerprint** (APPROVE)

| Component | Source |
|---|---|
| `script_updated_at` | Copied from script row at enqueue |
| `input_fingerprint` | `sha256(primary_id ‖ voiceover_id ?? "" ‖ template_id)` hex — server only |
| Client | **Cannot** supply or override fingerprint |

---

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Use `exec`/`execSync` or shell-string FFmpeg | **REJECT** |
| Pass script text, notes, or user filenames into FFmpeg args or filtergraph (Phase A) | **REJECT** |
| `fetch(httpUrl)` for assembly input bytes | **REJECT** |
| Accept client-supplied `primaryVideoAssetId`, `templateId`, or `clientId` on trigger | **REJECT** |
| Allow Cliente to call assemble action | **REJECT** |
| Expose browser-callable endpoint that SETS assembly `status` or `output_media_asset_id` | **REJECT** |
| Serve `assembled_reel` without auth + ownership check | **REJECT** |
| Read Storage using unvalidated or client-supplied `storage_key` | **REJECT** |
| Run FFmpeg on Vercel serverless | **REJECT** (ADR-0003) |
| Skip cross-tenant check between job row and input assets | **REJECT** |
| Return `storage_key` or FFmpeg command in Operator DTO | **REJECT** |
| Add unauthenticated worker HTTP callback without shared-secret auth | **REJECT** (not in V1 scope) |

---

## Future-Proofing Notes

- **US-9.2** second-pass FFmpeg must escape/sanitize subtitle text before drawtext/subtitle files — do not weaken US-9.1 Phase A “no text in filters” pattern; US-9.2 owns injection controls for burn-in.
- **US-8.5** B-roll clips: assembly Phase B resolves **`asset_role = broll`** ids server-side only; concat args builder same spawn rules.
- **US-10.1 / US-11.1** consume `assembled_reels.id` and output asset id — no client “skip QA” flags on assembly.
- **integrations-engineer** weekly auto-assemble must call same **`createAssemblyJobForReelScript`** orchestrator — no alternate bypass path; cron auth is separate story.
- **Multi-tenancy:** all queries scoped by server `client_id`; enabling RLS later is additive.
- **Real auth (US-14.5):** Operator assemble and worker rows use server-resolved identity — never request `actor` or `clientId`.
- **Storage migration (local → S3):** `getMediaStorage()` abstraction unchanged; assembly security rules unchanged.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before BUILD starts, verify CONTRACT:

- [ ] Assemble action input `{ reelScriptId }` only; **`FORBIDDEN_FIELDS`** documented
- [ ] Orchestrator gate order: operator → script tenancy → primary job resolution → asset ownership → fingerprint → idempotency → INSERT → enqueue
- [ ] **`neuramark_assembled_reels`** DDL with `client_id`, idempotency columns, partial unique on completed triple
- [ ] **`assembled_reel`** media type + storage key regex
- [ ] **`buildReelV1BasicArgs`** signature — local paths + numeric duration only
- [ ] **`spawn` with `shell: false`** explicit in worker module
- [ ] **`applyAssemblyJobUpdate`** (or exact name) — sole status writer; transition table
- [ ] **`GET /api/assembly-jobs/[jobId]`** — GET-only, operator, 404 IDOR, minimal DTO
- [ ] Media serve extension for `assembled_reel` — Operator + ownership
- [ ] **`ASSEMBLY_JOB_POLL_MODE`**, **`NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN`**, **`NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC`** frozen defaults
- [ ] ADR-0003 matrix — FFmpeg on Fly; Vercel enqueue only
- [ ] Worker **does not** use M1 provider-asset URLs — Storage SDK documented
- [ ] Phase B stub called out — same security floors when implemented
- [ ] Security test matrix listed
- [ ] **Reviewed by FE** line present before BUILD

---

## Open questions — SECURITY resolutions

| # | Question (from PREP/TASKS) | Resolution |
|---|---|---|
| 1 | Worker auth via M1 HMAC? | **No.** M1 is for **external vendors** fetching assets over HTTPS. Assembly worker uses **service-role Storage SDK** on Fly. Do not add unauthenticated asset routes for worker. |
| 2 | Operator vs Cliente preview serve | **Operator V1** for `assembled_reel` (mirror `generated_video`). US-11.1 may widen Cliente read later — explicit separate change. |
| 3 | Budget gate on assembly? | **Out of scope V1** (PO: `$0` or omit spend). If CONTRACT adds `$0` stub, no client-supplied cost fields. No `skipBudgetCheck` flags. |
| 4 | Idempotency race on concurrent assemble clicks | **Return existing completed** or single in-flight row; partial unique index + transactional check — CONTRACT freezes. |
| 5 | Faceless / B-roll Phase B injection | **`cold_open_notes`** → numeric seconds parsed server-side with max cap — **never** raw string in FFmpeg. B-roll ids from server resolution only. |
| 6 | Cron auto-assemble later | Must call same orchestrator — **no** alternate worker entry that skips operator gates unless separate Operator/cron auth story adds **`requireOperator` equivalent for system actor** (future). |

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — **nextjs-backend** (primary) and **media-pipeline-engineer** may author `plan/stories/US-9.1/CONTRACT.md`. Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **pointer-only assemble input** + forbidden asset/template/URL fields; (2) **`requireOperator`** on mutate/read routes; (3) **spawn args-array FFmpeg** with Phase A no-text-in-filters; (4) **Storage SDK only** — no assembly-time URL fetch; (5) **asset ownership + storage_key regex** before worker I/O; (6) **single server-only status applier**; (7) **GET-only assembly poll** with `client_id` scope → **404** IDOR; (8) **`assembled_reel` serve** Operator + ownership; (9) **idempotency triple** server-computed; (10) **worker tenancy re-check**; (11) ADR-0003 runtime split; (12) security test matrix |
| **REDESIGN** | Client supplies asset ids or template; FFmpeg via shell string; assembly fetches arbitrary URLs; browser mutates assembly status; serve without ownership; Vercel runs FFmpeg |
| **VETO (do not BUILD)** | Any assemble trigger without `requireOperator`; any `exec(` with interpolated user input; worker reads Storage from client-supplied URL; DTO exposes `storage_key` or ffmpeg command |

**Conditions that must be satisfied before BUILD (not optional polish):**

1. **Anti–injection:** spawn args-array, shell false, Phase A no user text in filters.
2. **Anti–SSRF:** Storage SDK only at assembly — zero URL fetch for inputs.
3. **Anti–IDOR:** `(id, client_id)` on script, job, and asset serve paths → **404**.
4. **Anti–client-authority:** pointer-only trigger; server resolves all inputs; worker-only status writes.

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any REDESIGN finding blocks BUILD until CONTRACT revision.

---

## CONTRACT freeze list (binding summary)

1. **Trigger:** `{ reelScriptId }` only; **`requireOperator` first**; forbidden asset/template/URL/status fields.
2. **Inputs:** server-resolved primary + voiceover; ownership verified; **`input_fingerprint`** server-only.
3. **FFmpeg:** **`spawn` args-array**, `shell: false`; **`buildReelV1BasicArgs`** pure function; Phase A no drawtext/subtitle paths.
4. **Storage:** validated `storage_key` regex; SDK read/write; **no HTTP fetch** for inputs.
5. **Worker:** Fly polls DB (ADR-0003); service-role; **not** M1 HMAC; re-verify tenancy at run.
6. **Status:** **`lib/assembly/**`** sole writer; GET-only Operator poll; stale timeout worker-only.
7. **Output:** `assembled_reel` asset + ownership-checked Operator serve.
8. **Idempotency:** completed unique on **`(reel_script_id, script_updated_at, input_fingerprint)`** per tenant.
9. **DTO:** no `storage_key`, FFmpeg args, or temp paths.
10. **Tests:** forbidden fields, IDOR 404, Cliente 403, no fetch in assembly, grep status writes.

---

## BUILD vetoes (summary)

1. **Shell-string or `exec`-based FFmpeg invocation.**
2. **User/script text or unsanitized filenames in FFmpeg arguments (Phase A).**
3. **HTTP(S) fetch of asset bytes at assembly time.**
4. **Client-supplied `primaryVideoAssetId`, `voiceoverAssetId`, `templateId`, or `clientId` on assemble.**
5. **Assemble or assembly status routes without `requireOperator("handler")` (mutations) or without `client_id` scope (reads).**
6. **Browser-callable endpoint UPDATEing `neuramark_assembled_reels.status` or `output_media_asset_id`.**
7. **Serving `assembled_reel` without Operator session + ownership match.**
8. **Worker processing job when input asset `client_id` ≠ job `client_id`.**
9. **Storage read using `storage_key` that fails regex validation.**
10. **FFmpeg execution on Vercel (violates ADR-0003).**
11. **Operator DTO or API response exposing `storage_key`, ffmpeg argv, or stderr.**
12. **Unauthenticated HTTP asset endpoint for worker input (do not copy M1 pattern for internal worker).**

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — US-9.1 is the project's primary **command-injection** and **SSRF** surface (SECURITY_BASELINE Top 5). The PO design correctly isolates FFmpeg to a **trusted Fly worker**, restricts trigger input to a **single pointer**, resolves media through **owned `media_assets` rows**, and forbids **assembly-time URL fetch**. Conditions are the frozen CONTRACT items: spawn-only FFmpeg, closed status writes, tenancy checks on script/job/assets, and Operator-gated serve. Satisfying them closes injection, SSRF, IDOR, and client-authority bypass without blocking US-9.2 / US-10.1 / US-11.1 downstream consumption.

**CONTRACT may proceed:** **Yes** (after spec-guardian SPEC-REVIEW and FE review line in CONTRACT).

---
---

# Security Design Review — US-9.1 Phase B (Faceless B-roll stitch)

**Story:** US-9.1 Phase B — stitch completed Wan `broll` clips (+ voiceover) into 9:16 assembled Reel for **faceless** only  
**Sprint label:** `US-9.1-B`  
**Date:** 2026-08-31  
**Reviewer:** security-architect  
**Branch:** `feature/US-9.1-phase-b-broll-stitch`  
**Sources:** `plan/stories/US-9.1/PHASE-B.md` (PO B1–B14), Phase A section above, `plan/SECURITY_BASELINE.md` (FFmpeg / SSRF), `plan/stories/US-8.5/SECURITY.md` (owned `broll` handoff, degrade non-leak, no CDN-at-assembly), `plan/stories/US-9.1/CONTRACT.md` Phase B stub, `docs/adr/0003-worker-flyio-ffmpeg.md`  
**Status:** Binding amendment to US-9.1 SECURITY. Phase A floors **remain in force** — Phase B **extends** them; it does not replace or weaken them. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **media-pipeline-engineer** (`build-broll-concat-args`, faceless `runAssemblyJob` branch). **nextjs-backend** (`resolveAssemblyInputs` faceless, fingerprint `path_tag`, CONTRACT Phase B). **nextjs-frontend** (Assemble enablement only — no path/URL authority).

---

## Verdict: APPROVE WITH CONDITIONS

Phase B shape is correct and inherits Phase A controls: **same** Operator-gated `{ reelScriptId }` trigger; **server-resolved** ordered `broll` asset FKs (cap **8**) + voiceover; **Fly worker** concat via **`build-broll-concat-args` → `spawn('ffmpeg', args[], { shell: false })`** on **server temp paths only**; **Storage SDK** downloads of **owned** `media_assets` only — **never** client paths/URLs, **never** SiliconFlow CDN at assembly; **optional cold-open** as **numeric seconds** only; **degrade** to Phase A primary / `ASSEMBLY_INPUTS_INCOMPLETE` **without** vendor bodies, keys, argv, or temp paths in Operator-visible errors.

No REDESIGN. No veto of PO freezes B1–B14. CONTRACT Phase B amendment may proceed after encoding the conditions below.

**Condition count (Phase B):** **10** binding conditions (must land in CONTRACT Phase B + BUILD; see § Conditions before BUILD — Phase B).

**Phase A floors that remain absolute (do not weaken):** `requireOperator("handler")` first; pointer-only trigger + `FORBIDDEN_FIELDS`; spawn args-array / `shell: false`; Storage SDK only (no assembly-time HTTP fetch); worker-only status writes; IDOR **404**; Operator DTO closed (no `storage_key` / ffmpeg argv / stderr); ADR-0003 (FFmpeg on Fly).

**This phase owns:** Faceless branch of `resolveAssemblyInputs`; `input_fingerprint` extension (`ordered_broll_asset_ids` + `path_tag`); **`lib/assembly/ffmpeg/build-broll-concat-args.ts`**; faceless stitch path in `runAssemblyJob`; degrade / incomplete messaging hygiene; multi-asset ownership re-check; optional `parseColdOpenTrimSec` (CONTRACT name) — numeric only.

**This phase does not own:** Wan adapter / `createBrollVideoJobs` (US-8.5 ✅); talking-head B-roll overlays; full rewind FX / free-text `editing_hints`; US-9.2 drawtext; weekly auto-assemble; new assemble Route Handler; Cliente assemble.

---

### Threat Summary (US-9.1 Phase B–specific)

| Threat | Impact | Mitigation in Phase B |
|---|---|---|
| **Concat / filtergraph injection** | RCE via shell metacharacters, demuxer file lists, or filter_complex text | **`spawn('ffmpeg', args[], { shell: false })` only.** Builder **`build-broll-concat-args`** is a pure function over **local temp paths** (server UUID workspace) + **numeric** duration/tolerance/trim. **Forbidden in argv:** `brollBeats` text, raw `cold_open_notes`, Operator free text, original filenames, Storage keys, URLs |
| **Multi-clip IDOR / cross-tenant stitch** | Job for client A concat’d with client B’s B-roll MP4s | Every resolved `broll` (and voiceover) asset: **`WHERE id = $1 AND client_id = $jobClientId`** at resolver **and** again in worker before each Storage read. Foreign → fail / incomplete — **no** spawn |
| **Client-supplied clip paths / URLs / asset ids** | Path traversal, SSRF, cross-tenant input swap | Trigger remains **`{ reelScriptId }` only**. Reject `brollAssetIds`, `clipPaths`, `concatList`, URLs, `path_tag`, fingerprint overrides → **`FORBIDDEN_FIELDS`**. Ordering from server: completed `video_jobs` with `asset_role = broll`, **`created_at ASC`**, cap **8** |
| **SSRF / CDN fetch at stitch time** | Worker fetches SiliconFlow or arbitrary HTTPS | Same Phase A SSRF floor: **Storage SDK + validated `storage_key` only**. US-8.5 handoff = owned `media_assets` — **no** `fetch(cdnUrl)` in `lib/assembly/**` |
| **`cold_open_notes` text injection** | Free text becomes `-vf` / filter option | Optional lead trim **only** if server parse yields safe **non-negative integer seconds** within CONTRACT bounds (regex + max). Unparsable → **skip trim** (no fail-open into argv). **Never** pass raw notes string into FFmpeg |
| **Degrade path secret / internals leak** | Operator sees Wan bodies, Bearer tokens, ffmpeg argv, temp paths when clips missing | Degrade / incomplete: sanitized **messageKey** + closed codes only (mirror US-8.5 degrade non-leak). **No** vendor JSON, Authorization, `storage_key`, argv, stderr, or clip URLs in DTO/logs |
| **Talking-head accidental stitch** | Wrong modality runs concat / mixes unrelated broll | Stitch **only** when `modalidad === "faceless"` **and** ≥1 completed owned broll. Talking-head **always** Phase A primary path — **ignore** broll even if present |
| **Assemble without Operator** | Cliente / unauth triggers expensive FFmpeg | Unchanged: **`requireOperator("handler")` first** on `assembleReelForScript` / orchestrator — Cliente **403**, no INSERT |
| **Fingerprint bypass / path confusion** | Force re-run or wrong idempotency bucket | `input_fingerprint` server-only: include ordered broll ids + **`path_tag`** (`primary` vs `broll_stitch` — CONTRACT freezes exact strings). Client cannot supply `path_tag` or fingerprint |
| **Unbounded clip concat** | CPU/DoS via huge N | Hard cap **8** (align US-8.5). Excess completed jobs ignored after ordered take |

**Residual risk accepted (Phase B):** Malicious MP4 bytes in owned B-roll clips remain a content/parser risk bounded by download-and-own + tenancy (same as Phase A primary). Partial stitch (e.g. 3 of 5) is intentional product degrade — not a security bypass. Optional lineage JSON of broll ids on assembly row (if CONTRACT adds) must stay server-written and out of over-broad Operator DTOs.

---

## Assets and Trust Boundaries (Phase B delta)

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Up to 8 owned `broll` MP4s | **High** — tenant content | Resolved from completed jobs + `media_assets` with **`client_id`** match; Storage SDK only |
| Concat demuxer / filter_complex | **High** — injection surface | Built only from **server temp basenames** under `/tmp/neuramark-assembly/{assemblyJobId}/` |
| `cold_open_notes` (script field) | **Untrusted text** | Parsed to integer seconds or discarded — never argv |
| `brollBeats` / beat text | **Untrusted text** | Metadata/fingerprint count alignment only — **never** FFmpeg argv |
| Degrade / incomplete Operator messages | Medium | Sanitized codes + i18n keys — no secrets/paths |
| Extended `input_fingerprint` | Medium | Server-only hash over owned asset ids + `path_tag` |

**Boundaries (unchanged topology + Phase B rules):**

1. **Browser → assemble** — Still untrusted; **`{ reelScriptId }` only**; **`requireOperator("handler")` first**. FE enablement for faceless is convenience — server enforces B2/B4.
2. **Resolver (faceless)** — Server lists completed owned broll jobs (cap 8, `created_at ASC`); verifies each output asset tenancy; requires voiceover when stitch path has no usable audio (CONTRACT); zero broll → degrade rules (B4).
3. **Worker faceless branch** — Re-verify ownership per clip → download to fixed temp names (`broll-0.mp4` …) → **`build-broll-concat-args`** → spawn → upload `assembled_reel`. Talking-head never enters this branch for stitch.
4. **No new HTTP asset route** — Worker still must not use M1/HMAC or vendor CDN URLs for stitch inputs.

---

## Abuse Cases Considered (Phase B)

- *As a malicious actor, I POST `{ brollAssetIds: ["<victim-uuid>", …] }` on assemble* → **Blocked:** forbidden field; resolver ignores client lists.
- *As a malicious actor, I POST `{ concatListPath: "/etc/passwd" }` or a clip URL* → **Blocked:** forbidden; worker builds paths only inside job UUID temp dir.
- *As a malicious actor, I put `-i http://169.254.169.254/` in `cold_open_notes`* → **Blocked:** numeric parse only; raw string never reaches argv; unparsable → no trim.
- *As a malicious actor, I inject via `brollBeats` text into filter_complex* → **Blocked:** beats never enter FFmpeg builders (B3/B6).
- *As a malicious actor, I stitch another tenant’s completed broll by guessing asset UUIDs already in my script’s job rows* → **Blocked:** asset rows must match assembly **`client_id`**; foreign → no Storage read / no spawn.
- *As a Cliente, I call assemble now that faceless stitch exists* → **Blocked:** **`requireOperator`** → **403**.
- *As a malicious actor, I force talking-head to concat broll overlays* → **Blocked:** modality gate — talking-head ignores broll (B2).
- *As a malicious actor, I read SiliconFlow CDN URL from a failed Wan job and expect assembly to fetch it* → **Blocked:** assembly never reads provider URLs; only owned `storage_key`.
- *As a malicious actor, I trigger assemble with zero broll to scrape Wan errors from `failure_reason`* → **Blocked:** degrade/incomplete uses sanitized messageKey/codes only — no vendor bodies (US-8.5 parity).
- *As a malicious actor, I supply `path_tag: "broll_stitch"` with empty inputs to skip checks* → **Blocked:** `path_tag` server-computed from resolved modality/path; not request-accepted.
- *As a malicious actor, I use `exec("ffmpeg " + userArgs)` in the concat module* → **VETO / REJECT** at review — args-array only.

---

## Security Acceptance Criteria (Phase B — checkbox format)

Phase A `[SEC]` criteria above remain binding. Items below are **additive** for Phase B BUILD. Story `[SEC]` rows in USER_STORIES.md (args-array + no assembly-time URL fetch) **must be re-validated** against the concat path.

**Inherited (re-assert — do not weaken):**

- [ ] **[SEC] FFmpeg invoked with argument arrays, never shell string interpolation; inputs from validated owned `media_assets` only** *(USER_STORIES US-9.1 — applies to concat)*
- [ ] **[SEC] Assembly never fetches arbitrary URLs at assembly time (SSRF guard)** *(USER_STORIES US-9.1 — applies to multi-clip download)*
- [ ] **[SEC] `assembleReelForScript` / orchestrator: `requireOperator("handler")` as first await** *(Phase A — unchanged for Phase B trigger)*
- [ ] **[SEC] US-8.5 degrade non-leak floor:** failure/degrade surfaces never echo SiliconFlow/Wan secrets or raw vendor bodies *(US-8.5)*

**Added for Phase B (binding):**

- [ ] **[SEC] (Phase B) Concat builder:** **`build-broll-concat-args`** (CONTRACT-exact path under `lib/assembly/ffmpeg/`) returns **`string[]` only**; unit golden tests; **no** `exec` / `execSync` / shell string. Worker spawn: **`spawn('ffmpeg', args, { shell: false })`**
- [ ] **[SEC] (Phase B) Argv content allowlist:** concat demuxer / `-filter_complex` / `-i` entries reference **server temp paths** under `/tmp/neuramark-assembly/{assemblyJobId}/` with **fixed basenames** only. **Forbidden in argv:** `brollBeats`, raw `cold_open_notes`, script prose, Operator text, `storage_key`, original upload filenames, any `http(s):` URL
- [ ] **[SEC] (Phase B) Multi-asset ownership:** for **each** broll input id (and voiceover when used), resolver + worker **`SELECT … WHERE id = $1 AND client_id = $jobClientId`**. Any mismatch → **no** Storage read for that job run, **no** FFmpeg spawn; sanitized fail/incomplete
- [ ] **[SEC] (Phase B) No client-supplied paths/URLs/clip lists:** extend **`findForbiddenAssemblyKeys`** (or Phase B equivalent) to reject at least: `brollAssetIds`, `broll_asset_ids`, `clipPaths`, `clipUrls`, `concatList`, `concat_list_path`, `ffmpegArgs`, `path_tag`, `inputFingerprint`, any URL-shaped field → **`FORBIDDEN_FIELDS`**. Trigger schema remains **`{ reelScriptId }` only**
- [ ] **[SEC] (Phase B) Server-only clip resolution:** completed jobs with **`asset_role = broll`**, owned output asset, ordered **`created_at ASC`**, cap **8**. Talking-head modalities **must not** select the stitch path even if broll rows exist
- [ ] **[SEC] (Phase B) Cold-open numeric trim only:** optional trim seconds from **server parse** of `cold_open_notes` — CONTRACT-frozen regex + **non-negative integer** + **max bound**. Pass **number** into builder only. Unparsable / out-of-bounds → omit trim (do not interpolate string). **No** rewind FX / free-text filters in V1 Phase B
- [ ] **[SEC] (Phase B) Degrade without secret leak:** zero completed broll → Phase A primary path if owned primary exists; else **`ASSEMBLY_INPUTS_INCOMPLETE`** + faceless **messageKey**. Partial sets stitch completed subset only. Operator-visible errors/logs: **no** vendor bodies, Bearer/key substrings, ffmpeg argv, temp paths, or `storage_key`
- [ ] **[SEC] (Phase B) Fingerprint extension server-only:** fingerprint includes ordered broll asset ids + **`path_tag`** distinguishing `primary` vs `broll_stitch` (CONTRACT exact strings). Client cannot override. Idempotency triple tenancy rules unchanged
- [ ] **[SEC] (Phase B) No SiliconFlow / arbitrary HTTP in assembly:** grep/test — `lib/assembly/**` still has **zero** `fetch(` for asset bytes; downloads via Storage SDK + validated keys only (US-8.5 handoff)
- [ ] **[SEC] (Phase B) Automated security tests cover at least:** (1) forbidden broll/path/URL fields rejected; (2) Cliente **403** on assemble; (3) cross-tenant broll asset id rejected before spawn; (4) `build-broll-concat-args` golden args contain only temp paths + numerics — fixture `cold_open_notes` with metacharacters does not appear in argv; (5) mocked spawn receives **array** not string, `shell: false`; (6) degrade/incomplete message fixtures contain no key/CDN/argv substrings; (7) talking-head + present broll → Phase A builder path (no concat); (8) grep no `fetch(` in `lib/assembly/**` for downloads

---

## Design Concerns and Required Changes (Phase B)

### Frozen design choices (must land in CONTRACT Phase B)

#### B-1. Trigger / Operator gate — **unchanged** (APPROVE)

| Rule | Detail |
|---|---|
| Input | **`{ reelScriptId }` only** |
| Gate | **`requireOperator("handler")` first** |
| FE | Assemble enablement for faceless is UI-only; server enforces completeness |

#### B-2. FFmpeg concat — **args-array, temp paths only** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Module | **`build-broll-concat-args.ts`** pure `string[]` |
| Spawn | **`shell: false`** — same Phase A vetoes |
| Graph inputs | Local temp clip paths + optional voiceover path + numeric duration/tolerance/trim |
| Forbidden | Beat text, notes string, URLs, Storage keys in argv |

**Condition:** CONTRACT freezes builder signature, temp basename scheme, and concat approach (concat demuxer vs filter_complex) with **no user-text slots**.

#### B-3. Ownership — **N-clip tenancy** (APPROVE)

Every clip + voiceover re-checked; foreign → fail closed before I/O.

#### B-4. Cold open — **integer seconds or skip** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Parse | Safe non-negative int + max (CONTRACT) |
| Fail mode | Skip trim if unparsable — **never** pass through string |
| Out of scope | Rewind FX, free-text filters |

#### B-5. Degrade — **product continuity + secret hygiene** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Zero broll | Phase A if primary exists; else incomplete + messageKey |
| Partial | Stitch completed subset — no wait-for-all |
| Secrets | Same sanitizer bar as US-8.5 / Phase A DTOs |

#### B-6. Modality / fingerprint — **server path selection** (APPROVE)

Faceless + ≥1 broll → `broll_stitch` tag; talking-head → `primary` tag and Phase A graph. Fingerprint server-only.

---

### Vetoes (Phase B — would block BUILD)

| If implementers… | Verdict |
|---|---|
| Use shell-string / `exec` for concat | **REJECT** |
| Pass `brollBeats`, raw `cold_open_notes`, or user filenames into FFmpeg argv | **REJECT** |
| Accept client `brollAssetIds`, clip paths, concat lists, or URLs on trigger | **REJECT** |
| `fetch(httpUrl)` / SiliconFlow CDN for stitch inputs | **REJECT** |
| Skip per-clip `client_id` ownership check | **REJECT** |
| Assemble trigger without `requireOperator("handler")` | **REJECT** |
| Put vendor bodies, argv, or `storage_key` in degrade/incomplete Operator messages | **REJECT** |
| Run faceless concat for talking-head modalities | **REJECT** (product + confused-deputy surface) |

---

## Future-Proofing Notes (Phase B)

- **US-9.2** must not reuse concat builder as a vehicle for unsanitized drawtext — separate burn-in SECURITY.
- **Weekly auto-assemble** must call the same orchestrator (no alternate stitch entry that skips Operator/system-actor auth story).
- **Optional `broll_asset_ids` lineage column:** server-written only; omit from broad DTOs unless preview needs ids (prefer output asset id only).
- **Multi-tenancy:** N-clip ownership checks are the IDOR defense when RLS arrives — keep them even while single-tenant locally.

---

## CONTRACT Spot-Check Checklist (Phase B section)

Before Phase B BUILD, verify CONTRACT Phase B amendment:

- [ ] Faceless resolve rules (B2/B4), cap **8**, `created_at ASC`, talking-head ignores broll
- [ ] Fingerprint formula + exact **`path_tag`** strings
- [ ] **`build-broll-concat-args`** signature — local paths + numerics only; spawn `shell: false`
- [ ] Cold-open parse regex/bounds; unparsable → skip
- [ ] Forbidden fields list extended for broll/path/URL keys
- [ ] Degrade / `ASSEMBLY_INPUTS_INCOMPLETE` messageKeys — no secret leakage notes
- [ ] Voiceover required when stitch has no usable audio
- [ ] Security test matrix for concat injection, multi-asset IDOR, degrade non-leak, modality gate
- [ ] **Reviewed by FE** line for Assemble enablement
- [ ] Phase A floors explicitly still binding

---

## Conditions before BUILD — Phase B (binding — condition count = 10)

1. **Anti–shell-injection:** `build-broll-concat-args` → `spawn(..., { shell: false })` only; golden tests; no `exec`/shell strings.
2. **Anti–filtergraph-text-injection:** argv from server temp paths + numerics only — never beats/notes/filenames/URLs/`storage_key`.
3. **Anti–multi-clip-IDOR:** ownership check on **every** broll (+ voiceover) at resolve and before each Storage read.
4. **Anti–client-path/URL-authority:** trigger `{ reelScriptId }` only; extended `FORBIDDEN_FIELDS` for clip lists/paths/URLs/`path_tag`.
5. **Anti–SSRF-at-stitch:** Storage SDK only; no SiliconFlow CDN / `fetch(` for assembly inputs.
6. **Anti–cold-open-string-passthrough:** numeric trim seconds only (regex + bounds); else skip — never raw string in argv.
7. **Anti–degrade-secret-leak:** incomplete/degrade Operator surfaces sanitized (US-8.5 parity) — no vendor/argv/path/key leakage.
8. **Anti–Cliente-trigger:** `requireOperator("handler")` first on assemble mutate path (re-assert).
9. **Anti–modality-confused-deputy:** stitch only for faceless + ≥1 owned completed broll; talking-head always Phase A primary path.
10. **Anti–fingerprint-forgery:** server-only fingerprint including ordered broll ids + `path_tag`; client cannot supply.

---

## BUILD vetoes (Phase B summary)

1. **Shell-string or `exec`-based concat/FFmpeg.**
2. **`brollBeats` / raw `cold_open_notes` / user filenames / URLs in FFmpeg argv.**
3. **Client-supplied broll asset ids, clip paths, concat lists, or URLs on assemble.**
4. **HTTP(S) or SiliconFlow CDN fetch for stitch input bytes.**
5. **Missing per-clip `client_id` ownership verification.**
6. **Assemble without `requireOperator("handler")`.**
7. **Degrade/incomplete messages exposing secrets, argv, temp paths, or `storage_key`.**
8. **Faceless concat executed for talking-head modalities.**
9. **Client-supplied or overridable `path_tag` / `input_fingerprint`.**
10. **Skipping security tests for concat argv hygiene, multi-asset IDOR, and degrade non-leak.**

---

## Verdict Rationale (Phase B)

**APPROVE WITH CONDITIONS** — Phase B correctly extends the Phase A assembly trust model to **N owned B-roll clips** without opening new browser authority, shell, or SSRF surfaces. Primary new risks are **concat argv injection**, **multi-asset IDOR**, and **degrade/cold-open text leakage into FFmpeg or Operator DTOs** — all addressable with the **10 conditions** above. US-8.5 already guarantees download-and-own `broll` assets; assembly must **consume those rows only**.

**CONTRACT Phase B may proceed:** **Yes** (after/with SPEC-REVIEW Phase B). **Next gate:** nextjs-backend CONTRACT Phase B section + FE Reviewed line → BUILD.

### Gate summary (Phase B)

| Field | Value |
|---|---|
| **Verdict** | **APPROVE WITH CONDITIONS** |
| **Condition count** | **10** |
| **Veto** | No |
| **Next gate** | CONTRACT.md Phase B amendment |
