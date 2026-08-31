# Security Design Review — US-9.2

**Story:** US-9.2 — Add subtitles, logo, and cover  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-9.2 AC + `[SEC]`), `plan/stories/US-9.2/README.md`, `TASKS.md`, `plan/SECURITY_BASELINE.md` (§3 upload stack, §9 FFmpeg, Top 5 injection), `plan/stories/US-9.1/SECURITY.md` (spawn args-array, owned assets, worker-only status, Operator assemble gate), `plan/stories/US-3.3/SECURITY.md` (shared upload validator, magic bytes, ownership serve), `plan/stories/US-3.3/CONTRACT.md` (`validateAndPrepareMediaUpload`), `plan/stories/US-9.1/CONTRACT.md` (Phase A no drawtext, storage key regex, media serve), `plan/stories/US-14.5/CONTRACT.md` (`requireOperator`, `requireActive`), `docs/adr/0003-worker-flyio-ffmpeg.md`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **media-pipeline-engineer** (FFmpeg branding pass, ASS builder, cover extract, worker loop). **nextjs-backend** (DDL, orchestrator, Server Actions, serve route, sanitizer module, CONTRACT). **nextjs-frontend** (Ficha logo UI, Operator branding panel — no FFmpeg or path authority).

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: **second-pass FFmpeg branding** on US-9.1 **`assembled_reel`** output only; **burn-in subtitles** from server-resolved **`on_screen_text`** beats (never client-supplied at trigger); **logo overlay** from **Cliente-uploaded** `client_logo` on Ficha viva via the **US-3.3 shared upload stack**; **cover frame** JPEG extracted from **owned branded output**; **Fly worker** runs FFmpeg via **`spawn('ffmpeg', args[], { shell: false })`** on **local temp files** downloaded from **Supabase Storage** — **no shell interpolation**, **no assembly-time URL fetch**, **no raw subtitle text in argv**; **Operator-only** apply/re-brand trigger with **pointer-only input**; **Cliente-only** logo + default toggles; **worker-only** `branding_status` writes; **tenancy re-check** on every asset before I/O; **ownership-checked** media serve for new asset types.

No REDESIGN. No veto of PO lean defaults (ASS/subtitles filter with temp `.ass` file; equal beat timing V1; auto-chain after assembly complete; single logo replace-on-upload; cover @ 1.0s default; DejaVu Sans Bold bundled on worker; Operator V1 for branded video serve — Cliente gets logo/cover serve only until US-11.1 widens video preview). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-9.1 / US-3.3 / US-14.5 / SECURITY_BASELINE — do not weaken):** `requireOperator()` calls `requireActive()` first; role and `client_id` never from request; handler-level gates mandatory; foreign UUID → **404** (not 403); RLS deny-by-default on `neuramark_media_assets`, `neuramark_assembled_reels`, `neuramark_business_profiles`; service-role Node + Fly worker only; no `@supabase/supabase-js` in Client Components; download-and-own storage keys; US-9.1 Phase A remains no drawtext — US-9.2 owns the injection controls for the second pass; interim hardcoded user is sanctioned — not a finding.

**This story owns:** branding columns on **`neuramark_assembled_reels`**; **`logo_asset_id`** + **`assembly_config`** on **`neuramark_business_profiles`**; **`client_logo`** / **`cover_frame`** media types + storage regex; **`validateAndPrepareMediaUpload`** extension for `client_logo`; subtitle beat resolver + **sanitizer/ASS builder**; **`applyBrandingForAssembly`** / **`createBrandingJobForAssembly`** orchestrator; Cliente **`uploadClientLogo`** / **`removeClientLogo`** / **`updateAssemblyConfigDefaults`**; **`buildReelV1BrandingArgs()`** + **`runBrandingJob()`**; auto-chain hook on assembly `completed`; media serve extension; branding idempotency fingerprint; security tests for injection, upload, IDOR, forbidden trigger fields, worker tenancy.

**This story does not own:** US-9.1 primary assembly FFmpeg; STT/ASR subtitles; soft subtitle tracks; custom font upload (Phase B); VO-synced beat timing (Phase B); US-10.1 QA body; US-11.x approval UI (consumes branded output + cover id); weekly auto-branding cron; Cliente branding trigger; auth redesign; M1 HMAC provider-asset routes for worker input.

**Terminology:** **Ensamblado** · **Paquete de guion** · **texto en pantalla** · **Ficha viva** · **Reel 9:16** · **download-and-own** · **Operator** · **Cliente**. Technical names `buildReelV1BrandingArgs`, `branding_config`, `subtitleSourceHash` are canonical. Do not expose FFmpeg command strings, `storage_key`, temp paths, or raw `on_screen_text` in Operator/Cliente DTOs.

---

### Threat Summary (US-9.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **ASS / drawtext / filtergraph injection** | RCE or filter escape on Fly worker via malicious subtitle beats | Sanitize beats **before** ASS generation; temp `.ass` file path only in argv — **never** raw beat text in `-vf`/`-filter_complex`; **`spawn` args-array**, `shell: false`; bundled font path constant; unit tests with injection fixtures |
| **FFmpeg command injection via logo path / filenames** | RCE via shell metacharacters in paths | Input paths from **validated `storage_key`** after ownership check; temp dir **`/tmp/neuramark-branding/{assemblyJobId}/`** with fixed basenames; **no** client filenames in argv |
| **Client-supplied logo / base video / beat text at trigger** | Cross-tenant input swap or injection payload | Trigger input **`{ assemblyJobId, subtitlesEnabled?, logoEnabled? }` only**; orchestrator resolves base MP4, logo, beats server-side; forbidden asset ids, URLs, `onScreenText`, font options |
| **Logo upload MIME spoofing / polyglot** | XSS gadget, pipeline abuse, storage of hostile bytes | **Shared US-3.3 stack** extended for `client_logo`: magic-byte image allowlist (jpeg/png/webp), **2 MiB** cap, server-generated key, deny SVG/GIF/HTML/`text/*` |
| **Path traversal via logo/cover/branded storage keys** | Read/write arbitrary filesystem paths | Regex CHECK on INSERT; worker rejects keys not matching CONTRACT-frozen patterns before Storage read |
| **SSRF at branding time** | Worker fetches internal/metadata URLs | **No HTTP(S) fetch** of asset bytes; Storage SDK using validated `storage_key` only — same floor as US-9.1 |
| **Cliente triggers branding / forges completed status** | Unauthorized compute or pipeline skip | **`applyBrandingForAssembly`**: **`requireOperator("handler")` first** → Cliente **403**; **no** browser-callable endpoint UPDATEs `branding_status` or swaps output FKs |
| **IDOR on branding trigger / media serve / logo delete** | Cross-tenant Reel branding or asset leak | Assembly row load **`WHERE id = $1 AND client_id = $serverClientId`**; serve **`row.client_id === session.id`** else **404**; foreign id uniform **404** |
| **Operator cross-tenant logo read via asset UUID** | Another client's brand asset leaked | Logo serve: **`requireActive` or `requireOperator`** + **`client_id` match**; no Operator bypass to arbitrary tenant without ownership (V1 operator tenant = self) |
| **Cover frame tenancy leak** | Victim cover JPEG served to wrong session | Cover extracted only from **job-owned branded output**; `cover_media_asset_id` row scoped to job `client_id`; serve same ownership rule as logo |
| **Ficha PATCH smuggling `logo_asset_id` / `assembly_config`** | Client points profile at victim asset or unsafe JSON | US-2.2 PATCH allowlist **unchanged** — logo and defaults **only** via dedicated Server Actions with server-side validation |
| **Auto-chain bypass of Operator intent** | Client forces branding with attacker-controlled toggles | Auto-chain reads **`assembly_config`** from **server-resolved** `neuramark_business_profiles` row for job's `client_id` — not from request; Operator per-run toggles only on manual **`applyBrandingForAssembly`** |
| **Idempotency race / duplicate FFmpeg** | Double worker spend | Server-computed **`branding_fingerprint`**; completed row sticky; concurrent triggers → one winner (CONTRACT freezes) |
| **Over-exposure in branding DTO** | Leak storage keys, ASS content, FFmpeg argv | Operator DTO: status, toggles, cover asset id for download link — **no** `storage_key`, beat text, ASS body, ffmpeg args, stderr |

**Residual risk accepted:** Operator trust — Operator can brand for server-resolved client (V1: self). Malicious MP4/PNG bytes in owned assets are supply-chain concern bounded by magic-byte allowlist + owned-asset-only inputs (same as US-3.3/US-9.1). Productized AV scanning deferred. UUID guessing against uniform 404 is low sensitivity. Branded **video** serve to Cliente deferred to US-11.1 — V1 Operator preview only for full MP4; Cliente may preview **own logo** on Ficha and download **own cover** when exposed.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `on_screen_text` beats (from `neuramark_reel_scripts`) | Medium–High — becomes FFmpeg subtitle input | Loaded server-side for owned script; **sanitized** before ASS write; never accepted from branding trigger body |
| Generated ASS temp file | High — injection surface if unsanitized | Written only by server sanitizer; path under job temp dir; deleted in `finally` |
| `client_logo` bytes | Medium — brand identity; processed by FFmpeg | Cliente upload → shared validator → Storage; overlay only after ownership + `logoEnabled` |
| Pre-branding / branded MP4 bytes | **High** — tenant likeness/content | From `neuramark_media_assets` after `client_id` match |
| `cover_frame` JPEG | Medium–High — published still | Extracted from owned branded output; server-generated storage key |
| `assembly_config` / `branding_config` JSON | Medium — toggles + timing | Cliente edits defaults via strict Zod Server Action; snapshot copied server-side at enqueue; **`coverFrameSec`** numeric bounded |
| `neuramark_assembled_reels.branding_status` | High — pipeline gate | Worker-only writes via server-only applier |
| Bundled worker font path | Medium — must not be client-influenced | Constant in worker image — **no** client font upload V1 |
| Supabase service-role key (worker) | **Critical** | Fly env only |

**Boundaries:**

1. **Browser (Cliente) → `uploadClientLogo` / `removeClientLogo` / `updateAssemblyConfigDefaults`** — Untrusted file bytes, toggles. **`requireActive("handler")` first**. Identity never from body. Logo replace deletes prior **own** logo row + blob.
2. **Browser (Operator) → `applyBrandingForAssembly`** — Untrusted: `assemblyJobId`, optional booleans only. **`requireOperator("handler")` first**. No beat text, asset ids, URLs, `coverFrameSec` override (Phase B).
3. **Browser → `GET /api/media/assets/[assetId]`** (`client_logo`, `cover_frame`) — Untrusted UUID. Session → ownership → stream. **`Cache-Control: private, no-store`**. Foreign → **404**.
4. **Browser (Operator) → branded `assembled_reel` serve** — US-9.1 floor: **`requireOperator`** + ownership V1.
5. **Vercel orchestrator → Postgres + enqueue** — Resolves script beats, logo FK, base output asset, client defaults; computes fingerprint; INSERT `branding_status = queued` — **no FFmpeg on Vercel**.
6. **Fly worker → Storage → temp → FFmpeg → Storage → Postgres UPDATE** — Trusted process. Re-verify all input asset **`client_id === job.client_id`** before download. Status writes via **`import "server-only"`** branding applier only.
7. **Auto-chain on assembly `completed`** — Same orchestrator as manual trigger; uses server-resolved profile defaults — not a Cliente-callable endpoint.

**Worker auth (M1 HMAC — applicability):** Same as US-9.1 — internal Fly worker uses **service-role Storage SDK**, not M1 URLs. Do not add unauthenticated HTTP asset routes for branding input.

---

## Abuse Cases Considered

- *As a malicious actor, I PUT ASS override tags in `on_screen_text` (`{\fs120}`, `\clip`, `\pbo`, newline injection)* → **Blocked:** sanitizer strips/escapes ASS control chars; max line/beat limits (US-5.2); ASS built server-side; path-only in argv.
- *As a malicious actor, I pass `-vf evil` via a beat line containing `'` or `;`* → **Blocked:** no beat text in argv; temp file path from server UUID dir only; `spawn` args-array, `shell: false`.
- *As a malicious actor, I POST `{ logoAssetId: "<victim-uuid>" }` on apply branding* → **Blocked:** forbidden field; logo resolved from **`neuramark_business_profiles.logo_asset_id`** for job's `client_id`.
- *As a malicious actor, I POST `{ onScreenText: "injected" }` on apply branding* → **Blocked:** forbidden field; beats loaded from linked script row server-side.
- *As a malicious actor, I upload SVG/HTML disguised as PNG for logo* → **Blocked:** magic-byte allowlist; explicit SVG/GIF/HTML deny (US-3.3 stack).
- *As a malicious actor, I upload a 50 MiB logo* → **Blocked:** **`client_logo`** max **2 MiB** (stricter than avatar images).
- *As a malicious actor, I PATCH Ficha with `logo_asset_id` pointing at victim asset* → **Blocked:** US-2.2 allowlist rejects; only **`uploadClientLogo`** sets FK after successful **own** upload.
- *As a Cliente, I call `applyBrandingForAssembly`* → **Blocked:** **`requireOperator`** → **403**.
- *As a Cliente, I trigger auto-chain directly* → **Blocked:** auto-chain runs inside worker-only completion applier — no Cliente endpoint.
- *As a malicious actor, I GET victim `cover_frame` or `client_logo` by UUID* → **Blocked:** ownership query; foreign → **404**.
- *As a malicious actor, I smuggle `../../etc/passwd` in logo `storage_key`* → **Blocked:** server-generated key + regex CHECK; worker rejects invalid keys.
- *As a malicious actor, I pass a provider URL as FFmpeg `-i`* → **Blocked:** no URL parameters in branding path; Storage SDK by key only.
- *As a malicious actor, I set `coverFrameSec: -1` or `999999` via `assembly_config`* → **Blocked:** strict Zod **`min(0).max(45)`** on **`updateAssemblyConfigDefaults`**; snapshot validated at enqueue.
- *As a malicious actor, I PATCH `branding_status` to `completed` without FFmpeg* → **Blocked:** no client mutation route; grep CI for UPDATE outside `lib/assembly/**` branding modules.
- *As a malicious actor, I re-brand using victim's assembly job id* → **Blocked:** job load scoped by **`client_id`**; foreign → **404**.
- *As a malicious actor, I swap cross-tenant base MP4 by racing auto-chain* → **Blocked:** worker re-verifies **`pre_branding_output_media_asset_id`** and logo asset **`client_id === job.client_id`** before spawn.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-9.2 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on touched tables; privileged access via Node service-role + Fly worker only *(US-14.5)*
- [ ] **[SEC] Service-role key is used only from Node server modules and Fly worker** — never Client Components *(US-14.5 / ADR-0003)*
- [ ] **[SEC] Download-and-own:** canonical bytes live at **`neuramark_media_assets.storage_key`** — no long-lived third-party URL columns *(SECURITY_BASELINE)*
- [ ] **[SEC] FFmpeg is invoked with argument arrays, never shell string interpolation; all input paths come from validated `media_assets` records owned by the job's client** *(US-9.1 carry-forward — US-9.2 second pass)*

**US-9.2 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] Logo upload uses the shared upload validation stack (US-3.3): size limit, image MIME allowlist via magic bytes, server-generated storage key** *(USER_STORIES US-9.2)*
- [ ] **[SEC] Subtitle text is escaped/sanitized before being passed to the renderer (subtitle files and FFmpeg drawtext are injection surfaces)** *(USER_STORIES US-9.2)*

**Added in this review (binding for US-9.2 BUILD):**

- [ ] **[SEC] (added) `client_logo` upload extends `validateAndPrepareMediaUpload` in `lib/media/upload-validation.ts`** — **same module**, no fork. Pipeline: `requireActive` (caller) → **no consent gate** → size → magic bytes → server key → put → insert. **Images only:** `image/jpeg`, `image/png`, `image/webp`. **Max 2 MiB** (`NEURAMARK_MEDIA_MAX_LOGO_BYTES`, default 2097152). Deny SVG, GIF, HTML, `text/*`, video signatures. **`storage_key` pattern:** `neuramark/{clientId}/logo-{uuid}.{ext}` — CONTRACT freezes regex CHECK
- [ ] **[SEC] (added) Single active logo per client:** replace-on-upload deletes prior **own** `client_logo` row + storage object before INSERT new; `neuramark_business_profiles.logo_asset_id` updated atomically. **`removeClientLogo`**: ownership on FK + asset row; clears FK; deletes blob
- [ ] **[SEC] (added) Logo / defaults mutations are dedicated Server Actions only** — **`uploadClientLogo`**, **`removeClientLogo`**, **`updateAssemblyConfigDefaults`**. US-2.2 Ficha PATCH allowlist **must not** accept `logo_asset_id`, `assembly_config`, or branding keys
- [ ] **[SEC] (added) `updateAssemblyConfigDefaults`**: `requireActive("handler")`; **`assemblyConfigSchema`** strict Zod `{ subtitlesEnabled, logoEnabled, coverFrameSec }`; **`coverFrameSec`**: number **`min(0).max(45)`**; reject unknown keys; write only to **server-resolved** profile row
- [ ] **[SEC] (added) Subtitle sanitizer module** (`lib/assembly/subtitle-beats.ts` or CONTRACT name): load beats via **`resolveSubtitleBeats(on_screen_text)`** from **owned script** only; per line: trim; strip ASCII control chars (`U+0000–U+001F`, `U+007F`); enforce **`REEL_SCRIPT_MAX_BEAT_LINES_TOTAL`** (8) and **`REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE`** (40); escape for ASS: `\`, `{`, `}`, `%`, `\n` → literal space or ASS-safe newline policy (CONTRACT freezes); **reject** lines containing ASS override introducers after sanitize if still present (fail closed → skip subtitles + log code, or job `failed` — CONTRACT picks one)
- [ ] **[SEC] (added) ASS builder** (`buildAssFromBeats`): writes temp file under **`/tmp/neuramark-branding/{assemblyJobId}/subtitles.ass`** only; uses **bundled font** name constant (**DejaVu Sans Bold**); **no** user-controlled font path, style URL, or `\fn` from client input. Timing from **numeric** `target_duration_sec / beatCount` and **`coverFrameSec`** only
- [ ] **[SEC] (added) FFmpeg branding argv:** **`child_process.spawn('ffmpeg', args, { shell: false })`**. Args from **`buildReelV1BrandingArgs()`** pure function. **Forbidden in argv:** raw beat strings, script JSON, client filenames, URLs, dynamic font paths. Allowed path args: server temp files (`base.mp4`, `logo.png`, `subtitles.ass`, `branded.mp4`, `cover.jpg`) + bundled font file path constant. Unit-test golden snapshots + injection fixtures
- [ ] **[SEC] (added) Temp workspace isolation:** **`/tmp/neuramark-branding/{assemblyJobId}/`** where `assemblyJobId` is server UUID; fixed basenames; **`finally`** deletes tree. Never use `storage_key` or original filename as path segment
- [ ] **[SEC] (added) Owned assets only — no SSRF:** branding downloads via Storage SDK using **`storage_key`** from DB rows after ownership check. Inputs: **`pre_branding_output_media_asset_id`** (or current output before first branding), optional **`logo_asset_id`** → `client_logo` row. **Forbidden:** `fetch(httpUrl)`, client-supplied URLs, provider URLs, M1 signed URLs in branding path
- [ ] **[SEC] (added) Trigger input schema accepts `{ assemblyJobId: uuid, subtitlesEnabled?: boolean, logoEnabled?: boolean }` only.** Reject forbidden fields: `onScreenText`, `on_screen_text`, `logoAssetId`, `logo_asset_id`, `coverFrameSec`, `cover_frame_sec`, `clientId`, `client_id`, `status`, `brandingStatus`, `outputMediaAssetId`, `preBrandingOutputMediaAssetId`, `fontPath`, `font`, `beatText`, `subtitleBeats`, any URL field, `force`, `skipIdempotency` → **`FORBIDDEN_FIELDS`**. Implement **`findForbiddenBrandingKeys`** mirroring US-9.1 pattern
- [ ] **[SEC] (added) `applyBrandingForAssembly` / `createBrandingJobForAssembly` calls `requireOperator("handler")` as first await** before assembly load, beat resolution, INSERT, or enqueue. Cliente/unauthenticated → **403** / **401**, no side effects
- [ ] **[SEC] (added) Assembly job tenancy:** load **`neuramark_assembled_reels`** with **`WHERE id = $assemblyJobId AND client_id = $serverClientId AND status = 'completed'`** (base must exist). Foreign/missing/incomplete base → **404** uniform envelope
- [ ] **[SEC] (added) Logo resolution server-only:** when `logoEnabled` true, read **`neuramark_business_profiles.logo_asset_id`** for job's `client_id`; if NULL → skip overlay (no error). Verify logo media row **`client_id === job.client_id`** before download — mismatch → job **`failed`** sanitized, **no** spawn
- [ ] **[SEC] (added) Script / beat resolution server-only:** load **`on_screen_text`** from script linked to assembly row; **never** from request. Empty beats + `subtitlesEnabled: true` → effective skip burn-in (PO lean). **`subtitleSourceHash`** = sha256 of normalized sanitized beat lines — server only
- [ ] **[SEC] (added) `branding_config` snapshot** copied server-side at enqueue from client defaults + Operator toggle overrides + computed `subtitleBeatCount` / `subtitleSourceHash`. Client cannot POST snapshot JSON
- [ ] **[SEC] (added) Idempotency:** **`branding_fingerprint`** = sha256(`pre_branding_asset_id ‖ stableStringify(branding_config) ‖ subtitleSourceHash`) — server computed. Completed branding with same fingerprint returns existing outputs — no duplicate FFmpeg. **`client_id`** scoped partial unique index (CONTRACT freezes)
- [ ] **[SEC] (added) Closed branding status write surface:** the **only** modules that UPDATE `neuramark_assembled_reels.branding_status`, `output_media_asset_id`, `cover_media_asset_id`, `pre_branding_output_media_asset_id`, `branding_config` are **`import "server-only"`** under **`lib/assembly/**`** branding worker path (shared applier or CONTRACT exact). **Zero** Server Actions / Route Handlers mutate branding status from request body
- [ ] **[SEC] (added) Auto-chain hook** runs inside assembly completion applier (US-9.1 **`applyAssemblyJobUpdate`** when → `completed`): calls **`createBrandingJobForAssembly`** with server-resolved profile defaults — **not** client-triggerable; same tenancy and forbidden-field rules as manual path
- [ ] **[SEC] (added) Worker tenancy re-check:** inside **`runBrandingJob`**, before download: **`pre_branding` asset**, **logo asset** (if any), and job row **`client_id`** all match. Cross-tenant → **`failed`** + sanitized reason — **no** spawn
- [ ] **[SEC] (added) Cover extract tenancy:** cover JPEG generated from **local branded output** after successful encode; **`cover_media_asset_id`** INSERT with job `client_id`; **`cover_frame`** storage key regex validated. **`coverFrameSec`** from **`branding_config`** snapshot (numeric, pre-validated)
- [ ] **[SEC] (added) Media serve extension — auth matrix (CONTRACT freezes):**

  | `asset_type` | Auth | Ownership |
  |---|---|---|
  | `client_logo` | `requireActive("handler")` **or** `requireOperator("handler")` | `row.client_id === session.id` else **404** |
  | `cover_frame` | `requireActive("handler")` **or** `requireOperator("handler")` | same |
  | `assembled_reel` (branded) | **`requireOperator("handler")` V1** | same — **do not** widen Cliente video serve in US-9.2; US-11.1 owns approval preview widening |

  UUID validation; **`Cache-Control: private, no-store`**; sanitize **`Content-Disposition`**; **`Content-Type`** from stored `detectedMime`. Never expose `storage_key` in URL
- [ ] **[SEC] (added) Branding DTO minimal:** Operator panel fields: `brandingStatus`, `brandingConfig` toggles (booleans + `coverFrameSec` only), `coverMediaAssetId`, `canApplyBranding`, `canRebrand` — **no** `storage_key`, ASS content, `on_screen_text`, ffmpeg argv, stderr. Cliente profile DTO: logo preview URL (serve path), defaults toggles — **no** `storage_key`
- [ ] **[SEC] (added) Stale branding timeout worker-only:** **`markStaleBrandingJobsFailed()`** in worker loop — not client-triggered (CONTRACT env default e.g. **`NEURAMARK_BRANDING_STALE_TIMEOUT_MIN=15`**)
- [ ] **[SEC] (added) Do not log FFmpeg full stderr, ASS file contents, `storage_key`, or beat text in production** — job id, status, error code only
- [ ] **[SEC] (added) Automated security tests cover at least:** forbidden branding trigger fields rejected; Cliente **403** on `applyBrandingForAssembly`; foreign `assemblyJobId` **404**; logo SVG/HTML rejected; logo oversize rejected; sanitizer escapes ASS metacharacters (fixture: `{\fs999}`, `\`, `%`, newline); argv builder contains no raw beat text; mocked spawn receives array not string; foreign logo/cover serve **404**; cross-tenant worker assets rejected (mock DB); grep — no `UPDATE neuramark_assembled_reels.branding_status` outside branding worker modules; grep — no `fetch(` for asset download in branding path; Ficha PATCH rejects `logo_asset_id`

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Branding trigger — **Operator + pointer-only input** (APPROVE)

| Rule | Detail |
|---|---|
| Manual input | **`{ assemblyJobId, subtitlesEnabled?, logoEnabled? }` only** |
| Gate | **`requireOperator("handler")` first** |
| Auto-chain | On assembly `completed` — server defaults from profile; not Cliente-callable |
| Forbidden | Beat text, logo asset id, URLs, font options, status fields |

**Condition:** CONTRACT documents **`findForbiddenBrandingKeys`** explicitly.

#### 2. Subtitle pipeline — **sanitize → ASS file → subtitles filter** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Source | **`on_screen_text`** from owned script — server load only |
| Sanitize | Control-char strip + ASS escape + US-5.2 length limits |
| Render | Temp **`.ass`** under job temp dir; **`subtitles=`** or **`ass=`** filter with **path only** in argv |
| Forbidden | `-drawtext` with interpolated user strings; raw beats in argv |
| Font | Bundled **DejaVu Sans Bold** on worker image — constant path |

**Condition:** CONTRACT freezes sanitizer function + ASS escape table + fail-closed behavior on sanitizer rejection.

**Alternative rejected:** Per-beat **`drawtext`** with client strings in filtergraph — higher injection risk; ASS file with sanitization is PO lean and **APPROVED**.

#### 3. Logo upload — **US-3.3 stack extension** (APPROVE)

| Rule | Detail |
|---|---|
| Module | **`validateAndPrepareMediaUpload({ assetType: 'client_logo', … })`** |
| MIME | jpeg / png / webp magic bytes only |
| Size | **2 MiB** max |
| Key | `neuramark/{clientId}/logo-{uuid}.{ext}` |
| Consent | **Not required** (brand mark ≠ likeness consent) |
| Count | **One** active logo (replace-on-upload) |
| Surface | **`/profile`** Server Actions — not Preferencias |

#### 4. Cliente vs Operator authority — **split by mutation type** (APPROVE)

| Actor | Allowed | Forbidden |
|---|---|---|
| **Cliente** | Upload/remove logo; edit **`assembly_config`** defaults | `applyBrandingForAssembly`; edit `branding_config` snapshot; trigger worker |
| **Operator** | Apply/re-brand; per-run subtitle/logo toggles | Upload logo on behalf without explicit future story; edit client Ficha logo |

**Condition:** Operator toggles affect **next branding run** only — not live CSS overlay on already-burned video (PO lean — no security issue if enforced server-side on re-run).

#### 5. FFmpeg branding — **args array, owned inputs** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Spawn | **`spawn('ffmpeg', args, { shell: false })`** |
| Builder | **`buildReelV1BrandingArgs({ localBasePath, localLogoPath?, localAssPath?, localBrandedPath, … })`** → `string[]` |
| Inputs | Pre-branding MP4 + optional logo PNG + server ASS only |
| Cover | **`extractCoverFrameArgs`** — numeric `-ss` from snapshot; `-vframes 1` JPEG |
| SSRF | **No** URL fetch |

**Condition:** Golden unit tests for args arrays including logo-on, logo-off, subtitles-off paths.

#### 6. Cover frame export — **tenancy + owned output only** (APPROVE)

| Rule | Detail |
|---|---|
| Source | Local **branded** MP4 after encode — not pre-branding base |
| Timing | **`coverFrameSec`** from validated snapshot (default 1.0) |
| Storage | **`cover_frame`** type; server key `neuramark/{clientId}/cover-{uuid}.jpg` (CONTRACT freezes) |
| Serve | **`requireActive` or `requireOperator`** + ownership — enables US-11.3 Cliente download later |

#### 7. Status authority — **worker-only applier** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Writers | **`runBrandingJob`**, stale marker, shared branding applier only |
| Lineage | Set **`pre_branding_output_media_asset_id`** before swapping **`output_media_asset_id`** |
| Forbidden | Browser-callable branding status mutation |

**Condition:** CONTRACT lists allowed `branding_status` transitions: `null` → `queued` → `processing` → `completed`|`failed`|`skipped`.

#### 8. Media serve — **type-specific auth matrix** (APPROVE WITH CONDITIONS)

| Type | V1 serve |
|---|---|
| `client_logo` | Owning Cliente **or** Operator (same tenant) |
| `cover_frame` | Owning Cliente **or** Operator |
| `assembled_reel` | **Operator only** (inherit US-9.1 until US-11.1) |

**Condition:** Do not widen branded **video** to Cliente in US-9.2 BUILD — approval preview is US-11.1.

#### 9. Idempotency — **server fingerprint** (APPROVE)

| Component | Source |
|---|---|
| `pre_branding_output_media_asset_id` | Copied at branding start |
| `branding_config` | Server snapshot at enqueue |
| `subtitleSourceHash` | sha256 of sanitized beats |
| Client | **Cannot** supply fingerprint or force re-run bypass |

---

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Pass raw `on_screen_text` or beat lines into FFmpeg argv or unsanitized `-drawtext` | **REJECT** |
| Use `exec`/`execSync` or shell-string FFmpeg | **REJECT** |
| Accept client-supplied `logoAssetId`, beat text, or URLs on branding trigger | **REJECT** |
| Fork logo validation outside `validateAndPrepareMediaUpload` | **REJECT** |
| Trust client `Content-Type`/extension for logo MIME | **REJECT** |
| Allow Cliente to call `applyBrandingForAssembly` | **REJECT** |
| Expose browser-callable endpoint that SETS `branding_status` or swaps output FKs | **REJECT** |
| `fetch(httpUrl)` for branding input bytes | **REJECT** |
| Serve `client_logo` / `cover_frame` without auth + ownership | **REJECT** |
| Widen branded **`assembled_reel` video** to Cliente in US-9.2 without US-11.1 story | **REJECT** |
| Read Storage using unvalidated or client-supplied `storage_key` | **REJECT** |
| Run branding FFmpeg on Vercel serverless | **REJECT** (ADR-0003) |
| Skip cross-tenant check between job row and input assets | **REJECT** |
| Accept `logo_asset_id` or `assembly_config` via Ficha PATCH | **REJECT** |
| Return `storage_key`, ASS body, or FFmpeg command in DTO | **REJECT** |
| Use client-uploaded font path in filtergraph | **REJECT** |

---

## Future-Proofing Notes

- **US-11.1 / US-11.3** may widen **`assembled_reel` video serve** to owning Cliente for approval preview and IG export — additive auth branch only; do not weaken ownership check.
- **Phase B** VO-weighted timing and Operator **`coverFrameSec`** override must keep **numeric-only** inputs to FFmpeg — never raw script fields in filtergraph.
- **Phase B custom fonts** require a new story with upload validation stack — do not accept arbitrary font paths from profile JSON.
- **US-10.1** QA reads branded **`output_media_asset_id`** — no client “skip branding” flags on QA trigger.
- **integrations-engineer** weekly auto-brand must call same **`createBrandingJobForAssembly`** — no alternate bypass path.
- **Multi-tenancy:** all queries scoped by server `client_id`; RLS later is additive.
- **Real auth (US-14.5):** Cliente logo actions use **`requireActive`**; Operator branding uses **`requireOperator`** — never request `actor` or `clientId`.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before BUILD starts, verify CONTRACT:

- [ ] Branding action input `{ assemblyJobId, subtitlesEnabled?, logoEnabled? }` only; **`FORBIDDEN_FIELDS`** documented
- [ ] Orchestrator gate order: operator → assembly tenancy + completed base → script beats sanitize → logo FK resolve → snapshot → fingerprint → idempotency → INSERT → enqueue
- [ ] **`client_logo`** validator branch in **`validateAndPrepareMediaUpload`** — 2 MiB, image MIME, key regex
- [ ] **`assemblyConfigSchema`** + **`brandingConfigSnapshot`** shapes frozen
- [ ] Sanitizer + **`buildAssFromBeats`** signatures; ASS escape table; injection test fixtures
- [ ] **`buildReelV1BrandingArgs`** + **`extractCoverFrameArgs`** — local paths + numeric timing only
- [ ] **`spawn` with `shell: false`** explicit in branding worker module
- [ ] Branding status applier — sole writer; transition table
- [ ] Auto-chain hook location in assembly completion applier documented
- [ ] Media serve auth matrix per asset type (Cliente vs Operator for video)
- [ ] Storage key CHECK extensions: logo, cover, branded MP4
- [ ] **`NEURAMARK_BRANDING_STALE_TIMEOUT_MIN`**, typography constants, safe-zone numbers frozen
- [ ] ADR-0003 — branding FFmpeg on Fly; Vercel enqueue only
- [ ] Worker **does not** use M1 URLs — Storage SDK documented
- [ ] Security test matrix listed
- [ ] **Reviewed by FE** line present before BUILD

---

## Open questions — SECURITY resolutions

| # | Question (from PREP/TASKS) | Resolution |
|---|---|---|
| 1 | ASS vs drawtext filter graph | **ASS + `subtitles`/`ass` filter** with sanitized temp file — **APPROVED**. Raw drawtext with user strings **REJECTED** unless sanitizer proven equivalent (ASS preferred). |
| 2 | Auto-chain vs explicit Operator click | **Auto-chain APPROVED** — uses server-resolved profile defaults inside completion applier; not Cliente-callable. Operator **Re-brand** for toggle changes. |
| 3 | New storage key vs overwrite | **New `branded-{uuid}.mp4` key APPROVED** — preserves lineage; regex validated. |
| 4 | Cliente download cover on approval | **US-11.3** consumes serve route — US-9.2 must implement **`cover_frame` serve** with **`requireActive` + ownership** so Cliente path is ready; do not block on US-11.1 UI. |
| 5 | Branded video serve to Cliente in 9.2? | **No V1** — Operator-only for **`assembled_reel` MP4** (US-9.1 floor). Cliente gets logo + cover serve only. US-11.1 widens video. |
| 6 | Sanitizer fail-closed vs skip subtitles | **APPROVE fail-closed for injection residue** — if post-sanitize line still matches dangerous ASS override patterns, treat as **`failed`** with sanitized code (or skip burn-in with **`subtitlesEnabled` effective false** + audit log — CONTRACT picks one; prefer **no silent burn-in of unsanitized text**). |
| 7 | Logo consent gate? | **No** — `client_logo` is brand mark, not likeness media; US-3.2 consent applies to `avatar_reference` only. |
| 8 | Worker auth via M1 HMAC? | **No** — same as US-9.1; service-role Storage SDK on Fly. |

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — **nextjs-backend** (primary) and **media-pipeline-engineer** may author `plan/stories/US-9.2/CONTRACT.md`. Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **pointer-only branding trigger** + forbidden beat/asset/URL fields; (2) **`requireOperator`** on apply/re-brand; **`requireActive`** on logo/defaults; (3) **shared upload validator** `client_logo` branch; (4) **subtitle sanitizer + ASS builder** — no raw text in argv; (5) **spawn args-array FFmpeg** with owned inputs only; (6) **Storage SDK only** — no branding-time URL fetch; (7) **asset ownership + storage_key regex** before worker I/O; (8) **single server-only branding status applier**; (9) **cover_frame tenancy** + serve matrix; (10) **idempotency fingerprint** server-computed; (11) **worker tenancy re-check**; (12) **assembled_reel video serve Operator-only V1**; (13) ADR-0003 runtime split; (14) security test matrix |
| **REDESIGN** | Client supplies beat text, logo asset id, or font path; FFmpeg via shell string; branding fetches arbitrary URLs; browser mutates branding status; unsanitized subtitles in filtergraph; forked upload validator |
| **VETO (do not BUILD)** | Any branding trigger without operator gate (manual path); any `exec(` with user input; worker reads Storage from client URL; DTO exposes `storage_key` or ASS body; Cliente can apply branding; Ficha PATCH accepts logo FK |

**Conditions that must be satisfied before BUILD (not optional polish):**

1. **Anti–injection:** sanitize beats → ASS file → path-only in argv; spawn args-array, shell false; bundled font only.
2. **Anti–SSRF:** Storage SDK only — zero URL fetch for branding inputs.
3. **Anti–IDOR:** `(id, client_id)` on assembly job, logo, cover, and serve paths → **404**.
4. **Anti–client-authority:** pointer-only Operator trigger; server resolves logo, beats, base MP4; Cliente limited to logo file + defaults; worker-only status writes.
5. **Upload stack:** `client_logo` extends US-3.3 module — magic bytes, 2 MiB, server key.

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any REDESIGN finding blocks BUILD until CONTRACT revision.

---

## CONTRACT freeze list (binding summary)

1. **Trigger (manual):** `{ assemblyJobId, subtitlesEnabled?, logoEnabled? }` only; **`requireOperator` first**; forbidden beat/asset/URL/font/status fields.
2. **Trigger (auto):** assembly completion applier → **`createBrandingJobForAssembly`** with server profile defaults — not Cliente-callable.
3. **Cliente mutations:** **`uploadClientLogo`**, **`removeClientLogo`**, **`updateAssemblyConfigDefaults`** only — not Ficha PATCH; **`requireActive`**.
4. **Logo upload:** shared **`validateAndPrepareMediaUpload`** `client_logo` branch — jpeg/png/webp, 2 MiB, `neuramark/{clientId}/logo-{uuid}.{ext}`.
5. **Subtitles:** sanitize → **`buildAssFromBeats`** → temp `.ass`; **no raw text in argv**; US-5.2 limits enforced.
6. **FFmpeg:** **`spawn` args-array**, `shell: false`; **`buildReelV1BrandingArgs`** + **`extractCoverFrameArgs`** pure functions; bundled font path constant.
7. **Storage:** validated `storage_key` regex; SDK read/write; **no HTTP fetch** for inputs.
8. **Worker:** Fly polls/brands (ADR-0003); service-role; re-verify tenancy at run; temp dir cleanup.
9. **Status:** branding modules sole writer of `branding_status` + output/cover FKs; stale timeout worker-only.
10. **Serve:** `client_logo` + `cover_frame` → owning Cliente or Operator; **`assembled_reel` video → Operator V1**.
11. **Idempotency:** **`branding_fingerprint`** server-computed; completed sticky per tenant.
12. **DTO:** no `storage_key`, ASS body, beat text, or ffmpeg argv.
13. **Tests:** forbidden fields, sanitizer fixtures, logo MIME, IDOR 404, Cliente 403 on apply, no fetch in branding path, grep status writes.

---

## BUILD vetoes (summary)

1. **Raw beat text or unsanitized strings in FFmpeg arguments or filtergraph.**
2. **Shell-string or `exec`-based FFmpeg invocation.**
3. **HTTP(S) fetch of asset bytes at branding time.**
4. **Client-supplied `logoAssetId`, beat text, `coverFrameSec` (manual trigger), or URLs on branding action.**
5. **`applyBrandingForAssembly` without `requireOperator("handler")`.**
6. **Browser-callable endpoint UPDATEing `branding_status` or output/cover FKs.**
7. **Logo upload outside shared validator or without magic-byte check.**
8. **Serving `client_logo` / `cover_frame` without session + ownership match.**
9. **Widening branded video serve to Cliente in US-9.2 (without US-11.1).**
10. **Worker processing job when input asset `client_id` ≠ job `client_id`.**
11. **Storage read using `storage_key` that fails regex validation.**
12. **Branding FFmpeg on Vercel (violates ADR-0003).**
13. **Ficha PATCH accepting `logo_asset_id` or `assembly_config`.**
14. **Operator/Cliente DTO exposing `storage_key`, ASS content, or ffmpeg argv.**

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — US-9.2 extends the project's highest-risk surface (SECURITY_BASELINE Top 5: **FFmpeg injection** + **malicious uploads**) with **drawtext/subtitle burn-in** and **Cliente logo upload**. The PO design correctly inherits US-9.1's **spawn-only, owned-asset, worker-only status** model, US-3.3's **shared upload stack** for logos, and a **strict Operator/Cliente split** (Cliente owns brand file + defaults; Operator owns apply/re-brand). Conditions are the frozen CONTRACT items: ASS sanitization pipeline, pointer-only triggers, closed branding writes, tenancy on cover export, and type-specific serve auth. Satisfying them closes injection, SSRF, IDOR, and client-authority bypass without blocking US-10.1 / US-11.x downstream consumption.

**CONTRACT may proceed:** **Yes** (after spec-guardian SPEC-REVIEW and FE review line in CONTRACT).

---
---

# Security Design Review — US-9.2 Phase B (VO-synced timing + Operator coverFrameSec)

**Story:** US-9.2 Phase B — VO-proportional subtitle beat timing + per-reel Operator `coverFrameSec` override  
**Sprint label:** `US-9.2-B`  
**Date:** 2026-08-31  
**Reviewer:** security-architect  
**Branch:** `feature/US-9.2-phase-b-subtitle-cover`  
**Sources:** `plan/stories/US-9.2/PHASE-B.md` (PO B1–B15), Phase A section above, `plan/SECURITY_BASELINE.md` (§9 FFmpeg / Top 5 injection), `plan/stories/US-9.2/CONTRACT.md` Phase A (forbidden keys + ASS path), `docs/adr/0003-worker-flyio-ffmpeg.md`  
**Status:** Binding amendment to US-9.2 SECURITY. Phase A floors **remain in force** — Phase B **extends** them; it does not replace or weaken them. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **media-pipeline-engineer** (`buildAssFromBeats` timings, cover seek clamp). **nextjs-backend** (`computeVoProportionalBeatTimings`, apply schema `coverFrameSec?`, fingerprint, forbidden-keys amend, CONTRACT Phase B). **nextjs-frontend** (Operator `InputNumber` only — no path/text authority).

---

## Verdict: APPROVE WITH CONDITIONS

Phase B shape is correct and inherits Phase A controls: **same** Operator-gated branding trigger; **sanitized `on_screen_text` → ASS temp file → path-only in argv**; **`spawn('ffmpeg', args[], { shell: false })`** on **server temp paths**; **Storage SDK** + owned assets only — **no client-supplied paths/URLs**. Phase B adds only:

1. **VO word-partition timing** — `voiceover_text` loaded server-side and used **solely** to compute **numeric** start/end seconds; VO string **never** enters ASS Dialogue lines or FFmpeg argv.
2. **Optional Operator `coverFrameSec`** — **numeric-only**, Zod **`min(0).max(45)`**, merged into server `branding_config` snapshot; extract `-ss` from that number (then duration clamp). Auto-chain still uses **client defaults only**.

No REDESIGN. No veto of PO freezes B1–B15. **Phase A trigger freeze that forbade `coverFrameSec` on apply is superseded by this amendment** (B11) — all other Phase A forbidden keys remain. CONTRACT Phase B amendment may proceed after encoding the conditions below.

**Condition count (Phase B):** **8** binding conditions (must land in CONTRACT Phase B + BUILD; see § Conditions before BUILD — Phase B).

**Phase A floors that remain absolute (do not weaken):** `requireOperator("handler")` first on apply/re-brand; sanitize → ASS → path-only; spawn args-array / `shell: false`; Storage SDK only (no branding-time HTTP fetch); worker-only status writes; IDOR **404**; DTO closed (no `storage_key` / ASS body / ffmpeg argv / VO or on-screen text); ADR-0003; shared logo upload stack; no client font paths.

**This phase owns:** `computeVoProportionalBeatTimings()`; `buildAssFromBeats` explicit-timing path + equal-split fallback; `applyBrandingForAssembly` optional **`coverFrameSec?`**; forbidden-keys amend (allow numeric cover only); `voiceoverTimingHash` / fingerprint extension; Operator cover `InputNumber`; cover seek clamp vs measured duration.

**This phase does not own:** Custom / second font upload (still deferred); TTS/ASR word timestamps; soft subtitle tracks; Cliente `/profile` cover UI; new story ID; unchecking Phase A AC; US-11.x video-serve widen.

**Phase A text superseded (apply carefully):** Phase A § Assets boundary #2 and trigger schema that listed `coverFrameSec` as **forbidden on apply** — **Phase B allows optional number only**. Phase A BUILD veto #4 (“client-supplied `coverFrameSec` on branding action”) is **narrowed**: client-supplied **non-numeric / out-of-bounds / string** cover remains **REJECT**; valid Zod number on Operator apply is **ALLOWED**.

---

### Threat Summary (US-9.2 Phase B–specific)

| Threat | Impact | Mitigation in Phase B |
|---|---|---|
| **`coverFrameSec` injection / filter escape** | Hostile string in `-ss` or filtergraph | Trigger accepts **optional number only** via strict Zod **`min(0).max(45)`**; out-of-range → **`VALIDATION_ERROR`** before enqueue. Worker `-ss` from snapshot **number**; clamp to `[0, max(0, durationSec - 0.05)]`. **Never** stringify raw request text into argv |
| **VO text in ASS Dialogue / argv** | Injection via `voiceover_text` (same class as Phase A beat injection) | VO used **only** for whitespace-token **word counts** → numeric durations. ASS Dialogue = sanitized **`on_screen_text`** beats only. Unit tests: VO injection fixtures must not appear in ASS body or argv |
| **Client-supplied beat timings / cue list** | Attacker controls when text appears or smuggles timing side-channels | **No** client timings, cue JSON, or TTS timestamps. Server `computeVoProportionalBeatTimings` only; empty VO → Phase A equal split |
| **Forbidden-field regression** | Re-open beat/asset/URL/font authority while adding cover | Amend `findForbiddenBrandingKeys`: **remove** `coverFrameSec` / `cover_frame_sec` from forbidden for apply. **Still forbid** beat text, asset ids, URLs, fonts, snapshot JSON, paths, fingerprint overrides |
| **FFmpeg shell / path authority** | RCE via shell or client paths | Unchanged: **`spawn(..., { shell: false })`**; temp basenames under job UUID dir; **no** client-supplied paths, `storage_key` as path segment, or URLs as `-i` |
| **Sanitizer bypass via timing path** | New code path skips ASS escape | Timing math is orthogonal; **same** Phase A sanitizer runs before ASS write — mandatory re-verify on VO-timing path |
| **Fingerprint forgery / sticky wrong timings** | Skip re-brand when VO changed | Server **`voiceoverTimingHash`** (sha256 of normalized VO token list or CONTRACT-frozen partition input) in fingerprint; client cannot supply |
| **Auto-chain cover smuggling** | Cliente forces exotic cover second without Operator | Auto-chain copies **`assembly_config`** defaults only — **no** request `coverFrameSec` on auto path |

**Residual risk accepted (Phase B):** VO word partition is approximate (not TTS-aligned) — product residual, not a trust-boundary gap. Operator may choose any cover second in **0–45**; duration clamp prevents seek-past-EOF abuse. Malicious owned media bytes remain supply-chain risk bounded by Phase A upload/owned-asset floors.

---

## Assets and Trust Boundaries (Phase B delta)

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `voiceover_text` (script row) | **Untrusted text** — Medium–High | Loaded server-side for owned script; **tokenized for counts only**; never ASS Dialogue; never argv |
| Computed beat timings (`AssBeatTiming[]`) | Medium — numeric only | Server helper output; floats/ints into ASS timestamp fields — not free text |
| Operator `coverFrameSec` (request) | Medium — untrusted number | Zod-bounded; merged into server snapshot; extract uses number + clamp |
| `voiceoverTimingHash` | Medium | Server-only fingerprint input |
| Sanitized `on_screen_text` beats | Medium–High | **Unchanged** Phase A pipeline — sole ASS Dialogue source |

**Boundaries (unchanged topology + Phase B rules):**

1. **Browser (Operator) → `applyBrandingForAssembly`** — Untrusted: `assemblyJobId`, optional booleans, optional **`coverFrameSec` number**. **`requireOperator("handler")` first**. Still **no** beat text, VO text, asset ids, URLs, fonts, paths, snapshot JSON.
2. **Resolver / timing** — Load `on_screen_text` + `voiceover_text` from owned linked script; sanitize on-screen → ASS; VO → `computeVoProportionalBeatTimings` numerics only.
3. **Worker** — Same spawn/temp/owned-asset floors; ASS path-only; cover `-ss` from snapshot number + duration clamp.
4. **Auto-chain** — Profile defaults only; **no** Operator cover override parameter.

---

## Abuse Cases Considered (Phase B)

- *As a malicious actor, I POST `{ coverFrameSec: "; rm -rf /" }` or a string with filtergraph metacharacters* → **Blocked:** Zod **number** only; non-number → validation error; never interpolated as string into argv.
- *As a malicious actor, I POST `{ coverFrameSec: -5 }` or `99999`* → **Blocked:** Zod **`min(0).max(45)`** → **`VALIDATION_ERROR`** before enqueue; worker also clamps seek.
- *As a malicious actor, I put ASS overrides / `-vf` payloads in `voiceover_text` expecting them in Dialogue* → **Blocked:** VO never written to ASS Dialogue; only word counts drive numeric times; on-screen sanitizer unchanged for Dialogue text.
- *As a malicious actor, I POST `{ beatTimings: [...], voiceoverText: "..." }` on apply* → **Blocked:** forbidden fields; VO/timings resolved server-side only.
- *As a malicious actor, I POST `{ onScreenText: "injected" }` hoping Phase B relaxes forbids* → **Blocked:** still forbidden; beats from owned script only.
- *As a malicious actor, I POST `{ fontPath: "/evil.ttf" }` or a client temp path* → **Blocked:** forbidden; bundled font constant only; **no client-supplied paths**.
- *As a malicious actor, I POST `{ brandingConfig: { … } }` snapshot* → **Blocked:** forbidden; snapshot server-built.
- *As a Cliente, I set cover via apply now that Operator override exists* → **Blocked:** **`requireOperator`** → **403**; no Cliente cover UI (B9).
- *As a malicious actor, I use `exec("ffmpeg " + coverFrameSec)`* → **VETO / REJECT** — args-array only.
- *As a malicious actor, I skip sanitizer because timings come from a “new” helper* → **Blocked by design:** Phase B **must** call the same sanitizer before ASS write; VALIDATION re-verifies `[SEC]` on this path.

---

## Security Acceptance Criteria (Phase B — checkbox format)

Phase A `[SEC]` criteria above remain binding. Items below are **additive** for Phase B BUILD. Story `[SEC]` subtitle sanitization **must be re-validated** against the VO-timing + cover-override path.

**Inherited (re-assert — do not weaken):**

- [ ] **[SEC] Subtitle text is escaped/sanitized before being passed to the renderer** *(USER_STORIES US-9.2 — applies to VO-timing ASS path)*
- [ ] **[SEC] FFmpeg invoked with argument arrays, never shell string interpolation; inputs from validated owned `media_assets` only** *(US-9.1 / Phase A — applies to cover extract + branding pass)*
- [ ] **[SEC] `applyBrandingForAssembly`: `requireOperator("handler")` as first await** *(Phase A — unchanged)*
- [ ] **[SEC] No branding-time URL fetch; Storage SDK + validated keys only** *(Phase A SSRF floor)*

**Added for Phase B (binding):**

- [ ] **[SEC] (Phase B) Operator `coverFrameSec` numeric-only:** `applyBrandingForAssembly` input schema allows optional **`coverFrameSec`** as Zod **`number().min(0).max(45)`** only (finite; reject NaN/Infinity). Non-number / out-of-range → **`VALIDATION_ERROR`** — **no** enqueue. Merge into server **`branding_config`** snapshot. Auto-chain **must not** accept request cover — profile defaults only
- [ ] **[SEC] (Phase B) Cover extract argv:** `-ss` (or equivalent) from **numeric** snapshot `coverFrameSec` only; then clamp seek to **`[0, max(0, durationSec - 0.05)]`** using measured branded duration when available else `target_duration_sec`. **Forbidden:** raw request strings, script fields, or paths in cover argv beyond server temp output path
- [ ] **[SEC] (Phase B) VO text never in ASS Dialogue or FFmpeg argv:** `voiceover_text` used **only** inside **`computeVoProportionalBeatTimings`** for whitespace-token partition / word counts → **numeric** start/end. ASS Dialogue lines = sanitized **`on_screen_text`** beats only. Grep/tests: VO fixture strings must not appear in ASS file body or branding/cover argv
- [ ] **[SEC] (Phase B) `on_screen_text` sanitization unchanged and mandatory:** same Phase A sanitizer → **`buildAssFromBeats`** (with optional explicit timings) → temp `.ass` → **path-only** in argv. Timing path must not bypass sanitize. Empty VO / `totalWords === 0` → equal-split fallback (Phase A)
- [ ] **[SEC] (Phase B) Forbidden-keys amend:** remove **`coverFrameSec`** / **`cover_frame_sec`** from apply forbidden authority keys. **Still reject** at least: `onScreenText`, `on_screen_text`, `voiceoverText`, `voiceover_text`, `beatTimings`, `subtitleBeats`, `logoAssetId`, `logo_asset_id`, `fontPath`, `font`, `brandingConfig`, `assemblyConfig`, `clientId`, `client_id`, status/FK fields, any URL field, any path field (`tempPath`, `assPath`, `ffmpegArgs`, …), `voiceoverTimingHash`, `subtitleSourceHash`, `force`, `skipIdempotency` → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (Phase B) FFmpeg args-array + no client paths:** branding and cover extract continue **`spawn('ffmpeg', args, { shell: false })`** via pure builders. Allowed paths: server temp workspace under **`/tmp/neuramark-branding/{assemblyJobId}/`** with fixed basenames + bundled font constant. **Forbidden:** client-supplied paths, original filenames, `storage_key` as filesystem path, URLs as `-i`
- [ ] **[SEC] (Phase B) Timing + fingerprint server-only:** no client beat timings / cue lists / TTS timestamps. **`voiceoverTimingHash`** (CONTRACT-frozen input) included in **`branding_fingerprint`** so VO-driven timing changes invalidate idempotency; client cannot supply hash or fingerprint
- [ ] **[SEC] (Phase B) Automated security tests cover at least:** (1) `coverFrameSec` string / `-1` / `46` rejected; (2) valid `coverFrameSec` within bounds accepted and appears as **number** in cover args only; (3) VO injection fixture not in ASS Dialogue or argv; (4) on-screen ASS metacharacter fixture still sanitized; (5) forbidden beat/VO/path/URL/font/snapshot keys rejected; (6) mocked spawn receives **array** not string, `shell: false`; (7) Cliente **403** on apply; (8) fingerprint changes when VO tokens change (same on-screen beats)

---

## Design Concerns and Required Changes (Phase B)

### Frozen design choices (must land in CONTRACT Phase B)

#### B-1. Trigger schema amend — **optional numeric cover only** (APPROVE)

| Rule | Detail |
|---|---|
| Manual input | **`{ assemblyJobId, subtitlesEnabled?, logoEnabled?, coverFrameSec? }`** |
| `coverFrameSec` | Optional **number** `0–45` inclusive |
| Gate | **`requireOperator("handler")` first** |
| Auto-chain | Client **`assembly_config`** defaults only — no request cover |

**Condition:** CONTRACT documents amended **`findForbiddenBrandingKeys`** (cover keys allowed as typed number; all other Phase A forbids retained + VO/timing keys listed).

#### B-2. VO timing — **counts only, never dialogue** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Source | Server-loaded `voiceover_text` from owned script |
| Algorithm | Contiguous whitespace-token partition into `beatCount` buckets; durations proportional; fallback equal split |
| ASS Dialogue | Sanitized **`on_screen_text`** only |
| Forbidden | VO string in ASS body, filtergraph, or argv |

**Condition:** CONTRACT freezes helper signature + hash input for `voiceoverTimingHash`.

#### B-3. Subtitle sanitization — **re-assert** (APPROVE)

Phase A sanitizer + ASS temp file + path-only argv remain mandatory on the VO-timing code path.

#### B-4. FFmpeg / paths — **unchanged floor** (APPROVE)

`spawn` args-array, `shell: false`, server temp paths only, bundled font, Storage SDK — **no client-supplied paths**.

#### B-5. Cover extract — **numeric + clamp** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Input | Snapshot number from Zod-validated Operator override or client default |
| Runtime | Clamp to branded file duration window |
| Forbidden | String passthrough from request |

---

### Vetoes (Phase B — would block BUILD)

| If implementers… | Verdict |
|---|---|
| Pass `voiceover_text` (or any VO substring) into ASS Dialogue or FFmpeg argv | **REJECT** |
| Skip or weaken `on_screen_text` sanitizer on the timing path | **REJECT** |
| Accept non-numeric / unbounded `coverFrameSec` (string, NaN, &lt;0, &gt;45) into enqueue or argv | **REJECT** |
| Accept client beat timings, cue lists, VO text, paths, URLs, fonts, or snapshot JSON on apply | **REJECT** |
| Use shell-string / `exec` for branding or cover extract | **REJECT** |
| Use client-supplied filesystem paths or URLs as FFmpeg `-i` / subtitle path | **REJECT** |
| Auto-chain honors client request body `coverFrameSec` | **REJECT** |
| Client-supplied `voiceoverTimingHash` / fingerprint override | **REJECT** |

---

## Future-Proofing Notes (Phase B)

- **Custom fonts** remain a **new story** with upload validation — do not accept font paths from profile JSON or Operator apply.
- **TTS/ASR alignment** (if ever added) must still feed **numeric** cue times only — never raw provider transcript blobs into ASS without the sanitizer.
- **Cliente cover UI** (if later) must use the same Zod bounds via Server Action — never trust raw query/body strings in the worker.
- **Multi-tenancy:** VO/on-screen still loaded only from scripts owned by job `client_id`.

---

## CONTRACT Spot-Check Checklist (Phase B section)

Before Phase B BUILD, verify CONTRACT Phase B amendment:

- [ ] Apply input `{ assemblyJobId, subtitlesEnabled?, logoEnabled?, coverFrameSec? }` + Zod `0–45`
- [ ] Forbidden-keys list amended (cover allowed; VO/beat/path/URL/font/snapshot still forbidden)
- [ ] `computeVoProportionalBeatTimings` signature + equal-split fallback
- [ ] `voiceoverTimingHash` / fingerprint formula frozen
- [ ] `buildAssFromBeats` accepts explicit timings; Dialogue = sanitized on-screen only
- [ ] Cover extract: numeric `-ss` + duration clamp
- [ ] `spawn` / `shell: false` + no client paths re-asserted
- [ ] Auto-chain: profile defaults only (no Operator cover)
- [ ] Security test matrix for cover Zod, VO-not-in-ASS, sanitizer re-verify, forbidden keys, args-array
- [ ] **Reviewed by FE** line for Operator cover `InputNumber`
- [ ] Phase A floors explicitly still binding; Phase A AC remain checked

---

## Conditions before BUILD — Phase B (binding — condition count = 8)

1. **Anti–cover-injection:** optional Operator `coverFrameSec` is **numeric-only**, Zod **`min(0).max(45)`**; invalid → **`VALIDATION_ERROR`**; cover argv uses number + duration clamp — never raw strings.
2. **Anti–VO-in-ASS/argv:** `voiceover_text` used **only** for word-count partition → numeric timings; **never** ASS Dialogue or FFmpeg argv.
3. **Anti–subtitle-injection (re-assert):** `on_screen_text` still sanitized → ASS temp → path-only; timing path must not bypass sanitizer.
4. **Anti–client-authority / forbidden fields:** allow typed cover number only; still forbid beat/VO text, timings, asset ids, URLs, fonts, snapshot JSON, paths, hash overrides.
5. **Anti–shell-injection:** branding + cover extract via **`spawn` args-array**, `shell: false` only.
6. **Anti–client-paths/SSRF:** no client-supplied paths or URLs as FFmpeg inputs; server temp basenames + Storage SDK only.
7. **Anti–timing/fingerprint-forgery:** server-only VO timing helper + **`voiceoverTimingHash`** in fingerprint; no client cue lists.
8. **Anti–auto-chain cover smuggle:** auto-chain uses profile defaults only — no request `coverFrameSec`.

---

## BUILD vetoes (Phase B summary)

1. **`voiceover_text` (or VO substrings) in ASS Dialogue or FFmpeg argv.**
2. **Skipping/weakening `on_screen_text` sanitization on the VO-timing path.**
3. **Non-numeric or out-of-bounds `coverFrameSec` accepted into enqueue or interpolated as string into argv.**
4. **Client-supplied beat timings, VO/on-screen text, paths, URLs, fonts, or branding snapshot JSON on apply.**
5. **Shell-string or `exec`-based FFmpeg for branding/cover.**
6. **Client-supplied filesystem paths or HTTP(S) URLs as branding/cover inputs.**
7. **Auto-chain consuming request-body `coverFrameSec`.**
8. **Client-overridable `voiceoverTimingHash` / `branding_fingerprint`.**

---

## Verdict Rationale (Phase B)

**APPROVE WITH CONDITIONS** — Phase B correctly extends the Phase A branding trust model with **numeric-only** Operator cover override and **VO-derived numeric timings** without opening new text-injection, shell, or client-path surfaces. Primary new risks are **`coverFrameSec` string/filter escape**, **VO leakage into ASS/argv**, and **forbidden-field regression** while amending the trigger schema — all addressable with the **8 conditions** above. Phase A sanitizer + spawn + owned-asset floors remain the injection/SSRF backbone.

**CONTRACT Phase B may proceed:** **Yes** (after/with SPEC-REVIEW Phase B). **Next gate:** nextjs-backend CONTRACT Phase B section + FE Reviewed line → BUILD.

### Gate summary (Phase B)

| Field | Value |
|---|---|
| **Verdict** | **APPROVE WITH CONDITIONS** |
| **Condition count** | **8** |
| **Veto** | No |
| **Next gate** | CONTRACT.md Phase B amendment |

---
---

# Security Design Review — US-9.2 Phase B-M1

**Story:** US-9.2 Phase B-M1 — Worker `voiceoverTimingHash` re-check  
**Sprint label:** `US-9.2-B-M1`  
**Date:** 2026-08-31  
**Reviewer:** security-architect  
**Branch:** `feature/US-9.2-b-m1-voiceover-timing-hash`  
**Sources:** `plan/stories/US-9.2/PHASE-B-M1.md` (PO M1-1…M1-10), Phase A + Phase B sections above, `plan/stories/US-9.2/QA-PHASE-B.md` Medium #1  
**Status:** Binding **lean amend** — integrity hardening only. Phase A/B floors **remain in force**; this section does **not** rewrite them. Do not treat as CONTRACT.md. Do not check off `USER_STORIES.md` AC.  
**Primary implementers:** **media-pipeline-engineer** (worker guard). **nextjs-backend** (fail constant + CONTRACT amend + unit test). **FE: none.**

---

## Verdict: APPROVE WITH CONDITIONS

M1 closes a fingerprint integrity gap: worker already re-checks `subtitleSourceHash` but not `voiceoverTimingHash` before VO-proportional timings. Fix is correct and additive — mirror the subtitle-hash early-fail window; **no** new endpoints, client fields, or trust boundaries.

**Confirmed:** no new client authority; `voiceover_text` still never enters ASS Dialogue or FFmpeg argv; fail reasons sanitized codes only.

No REDESIGN. No veto of M1-1…M1-10. **Next gate:** CONTRACT amend (worker step + fail code) → BUILD.

**Condition count (Phase B-M1):** **4**

---

### Binding conditions (Phase B-M1)

1. **Guard placement:** After live script VO load + existing `subtitleSourceHash` check, **before** `mkdtemp` / ASS write / FFmpeg spawn — same early-fail window as subtitle hash (M1-2).
2. **Compare + fail closed:** Reuse **`computeVoiceoverTimingHash(voiceoverText)`**; if ≠ `config.voiceoverTimingHash` → **`failBrandingJob`** with sanitized i18n key (CONTRACT freezes exact string, parallel to `BRANDING_FAILURE_SUBTITLE_HASH`); **zero** spawn (M1-3…M1-5, M1-7).
3. **Legacy soft-skip only:** Enforce only when snapshot hash is **64-char hex**; empty/missing → skip VO-hash re-check (Phase A rows). Do **not** treat malformed non-empty values as skip — CONTRACT freezes (M1-6).
4. **No client authority / no VO leakage:** No new apply fields; `voiceoverTimingHash` stays forbidden from client; VO still counts-only → never ASS Dialogue / argv; Operator DTO / logs show sanitized fail code only — never live VO, hash digests, or argv (M1-8).

---

### Abuse cases (M1 delta)

- *As a malicious actor, I change `voiceover_text` after enqueue so ASS timings diverge from fingerprint* → **Blocked:** worker recompute ≠ snapshot → `failed`, no spawn.
- *As a malicious actor, I POST `voiceoverTimingHash` / override fingerprint on apply* → **Blocked:** still forbidden (Phase B); M1 adds no client path.
- *As a malicious actor, I force VO into ASS/argv via the new guard path* → **Blocked:** guard is hash compare only; VO still never written to Dialogue/argv.
- *As a malicious actor, I read VO or hash digests from the failure DTO* → **Blocked:** sanitized i18n code only.

---

### Security Acceptance Criteria (Phase B-M1 — additive for VALIDATION)

Phase A/B `[SEC]` remain binding. Additive only:

- [ ] **[SEC] (Phase B-M1) Worker `voiceoverTimingHash` re-check:** After live VO load and `subtitleSourceHash` guard, before temp dir / ASS / spawn: if `config.voiceoverTimingHash` is **64-char hex**, recompute via **`computeVoiceoverTimingHash(voiceoverText)`**; mismatch → **`failBrandingJob`** + CONTRACT-frozen sanitized key; **no** FFmpeg spawn. Empty/missing hash → skip re-check (legacy). Empty VO with present hash still enforced.
- [ ] **[SEC] (Phase B-M1) No new client authority:** M1 adds **no** apply/trigger fields, no client-supplied hash/timings, no FE surface. `voiceoverTimingHash` / fingerprint overrides remain **`FORBIDDEN_FIELDS`**.
- [ ] **[SEC] (Phase B-M1) VO still never in ASS Dialogue or argv:** Guard path does not write VO into ASS body or FFmpeg args; unit test: mismatch → zero spawn; match path still has no VO substrings in ASS/argv.
- [ ] **[SEC] (Phase B-M1) Sanitized failure only:** Fail reason is i18n/code constant only — no live VO text, hash digests, `storage_key`, or argv in Operator DTO or production logs.

---

### Vetoes (Phase B-M1)

| If implementers… | Verdict |
|---|---|
| Proceed to VO-proportional ASS / spawn when hex snapshot hash ≠ live recompute | **REJECT** |
| Accept client-supplied `voiceoverTimingHash` or skip-guard flags | **REJECT** |
| Soft-skip on malformed non-empty snapshot hash (non-64-hex) without CONTRACT rule | **REJECT** |
| Put VO / hash digest / argv into fail DTO or logs | **REJECT** |
| Place guard after ASS write or spawn | **REJECT** |

---

### Gate summary (Phase B-M1)

| Field | Value |
|---|---|
| **Verdict** | **APPROVE WITH CONDITIONS** |
| **Condition count** | **4** |
| **Veto** | No |
| **Next gate** | CONTRACT.md Phase B-M1 amend (worker step + fail code) — then BUILD |

**CONTRACT may proceed:** **Yes.** Do not start CONTRACT in this security turn.

---
---

# Security Design Review — US-9.2 Phase B-M2

**Story:** US-9.2 Phase B-M2 — Branding poll atomic claim  
**Sprint label:** `US-9.2-B-M2`  
**Date:** 2026-08-31  
**Reviewer:** security-architect  
**Branch:** `feature/US-9.2-b-m2-branding-poll-claim`  
**Sources:** `plan/stories/US-9.2/PHASE-B-M2.md` (PO M2-1…M2-11), Phase A/B/B-M1 sections above, `plan/stories/US-9.1/SECURITY.md` (`[SEC] Worker job claim`), `plan/stories/US-9.2/QA.md` Medium #1 · `plan/stories/US-9.2/QA-PHASE-B.md` Medium #2  
**Status:** Binding **lean amend** — worker integrity / spend control only. Phase A/B/M1 floors **remain in force**; this section does **not** rewrite them. Do not treat as CONTRACT.md. Do not check off `USER_STORIES.md` AC.  
**Primary implementers:** **media-pipeline-engineer** (poll + runner gate). **nextjs-backend** (applier rows-affected + CONTRACT amend + lost-claim test). **FE: none.**

---

## Verdict: APPROVE WITH CONDITIONS

M2 closes a worker race gap: concurrent Fly replicas or dev in-process + poll overlap can both reach FFmpeg on the same `queued` row because poll SELECT lacks atomic claim and the applier does not treat zero-row UPDATE as lost race. Fix mirrors US-9.1 poll-runtime **intent** (conditional `UPDATE … WHERE branding_status = 'queued' RETURNING`; skip on zero rows) — **branding only**; US-9.1 assembly claim stays separate backlog.

**Confirmed (M2-8):** no new client authority, endpoints, or trust boundaries; claim is worker-only via existing `applyBrandingJobUpdate` applier; integrity / compute spend — not IDOR.

No REDESIGN. No veto of M2-1…M2-11. **Next gate:** CONTRACT amend (§ Poll runtime + `runBrandingJob` step 1) → BUILD.

**Condition count (Phase B-M2):** **5**

---

### Binding conditions (Phase B-M2)

1. **Atomic claim (M2-2):** `queued` → `processing` via conditional **`UPDATE … WHERE id = $1 AND status = 'completed' AND branding_status = 'queued'`** with `.select('id')` / `RETURNING`. **Zero rows** ⇒ lost race — not an error.
2. **Applier contract (M2-3):** `applyBrandingJobUpdate` for processing claim: when UPDATE matches **0 rows**, return **`{ ok: true, idempotent: true, brandingStatus: <current or null> }`** — **do not throw**; do not report `idempotent: false` on lost race.
3. **Runner gate (M2-4):** `runBrandingJob`: after claim attempt, if **`idempotent === true`** → **return immediately** (no `mkdtemp`, no Storage download, no spawn). If initial load shows **`branding_status === 'processing'`** before claim (peer owns row) → **return** — no resume-from-poll.
4. **Poll predicate (M2-5):** `pollQueuedBrandingJobsBatch` selects **`branding_status = 'queued'`** only — drop `processing` from candidate set. Stale `processing` remains **`markStaleBrandingJobsFailed`** → Operator re-brand; do not poll-resume mid-FFmpeg.
5. **Closed write surface (M2-8):** claim stays inside **`import "server-only"`** branding applier only — no new browser-callable routes; `pre_branding_output_media_asset_id` snapshot on successful claim only (M2-7).

---

### Abuse cases (M2 delta)

- *As a concurrent worker, I both SELECT the same `queued` row and run FFmpeg* → **Blocked:** one conditional UPDATE wins; loser gets zero rows → `idempotent: true` → no spawn.
- *As dev in-process `enqueueBrandingJob` + Fly poll on same row* → **Blocked:** atomic claim — one FFmpeg winner; loser exits silently (M2-6).
- *As a malicious actor, I trigger duplicate branding via a new client endpoint* → **Blocked:** M2 adds **no** client surface; existing Operator-only trigger unchanged.
- *As a worker, I resume another replica's mid-`processing` job from poll* → **Blocked:** poll `queued`-only; peer `processing` at runner entry → early return (M2-4, M2-5).

---

### Security Acceptance Criteria (Phase B-M2 — additive for VALIDATION)

Phase A/B/M1 `[SEC]` remain binding. Additive only:

- [ ] **[SEC] (Phase B-M2) Branding worker atomic job claim:** Before download / temp dir / FFmpeg, claim via conditional **`UPDATE neuramark_assembled_reels SET branding_status = 'processing' … WHERE id = $1 AND status = 'completed' AND branding_status = 'queued'`** with **`RETURNING` / `.select('id')`**. **Zero rows updated** ⇒ **`{ ok: true, idempotent: true }`** — **no** spawn. Mirror US-9.1 `[SEC] Worker job claim` intent for **`branding_status`** (not assembly `status`).
- [ ] **[SEC] (Phase B-M2) Lost-race applier semantics:** `applyBrandingJobUpdate` processing claim inspects rows affected / RETURNING — lost race returns **`idempotent: true`**, not throw and not **`idempotent: false`**. Terminal / illegal transitions keep existing idempotent behavior.
- [ ] **[SEC] (Phase B-M2) Runner early-exit gate:** `runBrandingJob` returns before **`mkdtemp`**, Storage download, or **`spawn`** when claim returns **`idempotent: true`** or when row is already **`processing`** at entry (peer worker). Unit test: simulated lost claim → **zero** FFmpeg invocations.
- [ ] **[SEC] (Phase B-M2) Poll `queued`-only:** `pollQueuedBrandingJobsBatch` candidate set is **`branding_status = 'queued'`** only — **`processing`** excluded from poll SELECT. Stale sweeper owns stuck **`processing`**; no poll-driven mid-job resume.
- [ ] **[SEC] (Phase B-M2) No new client authority:** M2 adds **no** apply/trigger fields, endpoints, or FE surface. Branding status writes remain worker-only via existing applier; claim is not client-triggerable.

---

### Vetoes (Phase B-M2)

| If implementers… | Verdict |
|---|---|
| Proceed to download / FFmpeg when conditional claim UPDATE affects **zero rows** | **REJECT** |
| Return **`idempotent: false`** or throw on lost claim race | **REJECT** |
| Poll **`processing`** rows for concurrent FFmpeg (resume-from-poll) | **REJECT** |
| Add browser-callable claim or branding-status mutation for M2 | **REJECT** |
| Bundle US-9.1 assembly poll claim changes in this branch | **REJECT** (scope — M2-11) |

---

### Gate summary (Phase B-M2)

| Field | Value |
|---|---|
| **Verdict** | **APPROVE WITH CONDITIONS** |
| **Condition count** | **5** |
| **Veto** | No |
| **Next gate** | CONTRACT.md Phase B-M2 amend (atomic claim + poll predicate + runner step 1) — then BUILD |

**CONTRACT may proceed:** **Yes.** FE Reviewed **N/A** (M2-9).
