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
