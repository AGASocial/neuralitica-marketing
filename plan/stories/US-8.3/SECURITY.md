# Security Design Review — US-8.3

**Story:** US-8.3 — Manual video upload fallback  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-8.3 AC + `[SEC]`), `plan/stories/US-8.3/README.md`, `TASKS.md`, `plan/stories/US-3.3/SECURITY.md` (shared upload validation stack), `plan/stories/US-8.4/SECURITY.md` (job row shape, closed status-write surface, Operator-only mutations), `plan/stories/US-8.2/SECURITY.md` (job create gates, IDOR), `plan/stories/US-8.1/SECURITY.md` + `CONTRACT.md` (adapter boundary), `plan/stories/US-7.3/CONTRACT.md` (`manualActualCostCents: 0`, `finalizeGenerationCost` sync_insert), `plan/stories/US-7.2/SECURITY.md` (`manual` never auto-ranked), `plan/stories/US-3.2/SECURITY.md` (`assertActiveAvatarConsentForJobs`), `plan/stories/US-14.5/SECURITY.md` (`requireOperator`), `plan/SECURITY_BASELINE.md` §3, `lib/media/upload-validation.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **media-pipeline-engineer** (manual adapter, upload orchestrator, validator extension) + **nextjs-backend** (`CONTRACT.md`, migration, Server Action, tests) + **nextjs-frontend** (Operator upload dialog — no status authority).

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: ship **Operator-only manual video upload** as a **sync-complete** path that reuses the **US-3.3 shared upload validation stack** (extended for **`generated_video`** with mandatory duration probe), inserts the **same `neuramark_video_jobs` terminal row shape** as API providers without opening a **client status-write surface**, records **Operator attribution** via **`operator_client_id`**, and wires **zero-cost spend** through **`finalizeGenerationCost({ mode: 'sync_insert', manualActualCostCents: 0 })`**. Manual bypasses **API cost**, not **consent**, **tenancy**, **file validation**, or downstream **US-10.1 QA / approval** gates.

No REDESIGN. The four primary threats — **Cliente self-service upload**, **cross-tenant IDOR on reel slots**, **client-forged job completion / provider smuggling**, and **compliance bypass via “manual” label** — are addressable with concrete acceptance criteria inherited from US-3.3 and US-8.4. Orchestrator may proceed to **CONTRACT.md** after encoding the items below.

**Primary threats modeled:**

| Threat | Abuse class |
|---|---|
| **Cliente self-service upload** | Non-operator uploads raw video into production pipeline; bypasses Operator review intent |
| **Cross-tenant IDOR** | Operator (or attacker) uploads to another client's reel slot via smuggled `clientId` / `reelScriptId` |
| **Client-forged job completion** | Request sets `status: completed`, `provider_key: manual`, `output_media_asset_id`, or `external_job_id` to skip validation/storage |
| **Validation bypass / polyglot upload** | HTML/SVG/exe disguised as video; oversized file DoS; over-duration clip enters assembly |
| **Compliance bypass** | Manual path skips QA (US-10.1), approval (US-11.x), or own-avatar consent (US-3.2) because upload was “free” |
| **Budget gate misuse** | Manual upload blocked when API spend exhausted — production deadlock; or manual used to smuggle non-zero spend |
| **Attribution gap** | Manual jobs exist without **`operator_client_id`** — unauditable Operator actions |
| **Status-write surface bleed** | Manual upload opens a second client-callable path that UPDATEs `neuramark_video_jobs.status` outside poller/webhook applier |

**Inherited floors (do not weaken):** US-3.3 shared validator + `MediaStorage` outside `public/` + server UUID keys; US-8.4 closed status-write surface (poller/webhook applier only for async transitions — manual uses orchestrator INSERT-at-terminal, not client UPDATE); US-8.2 consent + tenancy on job create; US-7.2 `manual` never auto-ranked; US-7.3 zero actual spend semantics; US-14.5 `requireOperator()` first on Operator mutations; interim hardcoded user is sanctioned — not a finding.

**This story owns:** `createManualUploadAdapter()` + registry registration; **`uploadManualVideoJob()`** sync orchestrator; extend **`validateAndPrepareMediaUpload`** (or shared sibling) for **`assetType: 'generated_video'`** with **duration probe**; **`operator_client_id`** migration + validation; **`uploadManualVideoJob`** Server Action; switch **`insertGeneratedVideoMediaAsset`** to **`generated_video`**; Operator upload UI on **`ReelDetailPanel`**; security tests for operator gate, IDOR, validation, forbidden fields, budget-at-cap success, consent gate.

**This story does not own:** API adapter bodies (US-8.2 / US-8.5–8.7); poller/stale/webhook (US-8.4 ✅); Cliente upload surfaces; US-10.1 QA agent body (must not be skipped); US-9.1 assembly; productized AV scanning; replace-in-place on completed API output (P1 defer); auth redesign.

---

### Threat Summary (US-8.3–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Non-operator upload** | Unauthorized production ingest | **`requireOperator('action')`** first await on **`uploadManualVideoJob`** → **403**; no Cliente Route Handler/Action for manual upload |
| **Cross-tenant reel binding** | Video attached to wrong Cliente reel | Load **`neuramark_reel_scripts`** by `reelScriptId` **and** `client_id = $validatedClientId`; mismatch / foreign → **404**; **`clientId`** validated against reel ownership — never trusted from browser alone |
| **Client sets `status` / `provider_key` / `output_media_asset_id`** | Forge completed manual job without file | Upload action schema **rejects** status, provider, cost, and output fields; orchestrator sets all job columns server-side after validation + storage |
| **Client supplies `external_job_id`** | UNIQUE constraint abuse / cross-job binding | Server generates **`manual-{uuid}`** only; forbidden on request body |
| **MIME spoofing / non-video polyglot** | XSS, pipeline abuse, malware | Extend US-3.3 stack: magic-byte detect **`video/mp4`** + **`video/quicktime`** only for **`generated_video`**; ignore client `Content-Type`/extension; explicit deny SVG/GIF/HTML/`text/*`/`application/*` |
| **Oversized upload DoS** | Disk/bandwidth exhaustion | **`getMaxVideoBytes()`** enforced before persist; streaming read cap where applicable |
| **Over-duration clip** | Policy bypass, assembly cost blowout | **Duration probe required in US-8.3** (closes US-3.3 defer); reject when **`durationSec > getMaxVideoDurationSec()`** (default **30s**) before INSERT |
| **Path traversal via filename** | Arbitrary path write | Server UUID + safe ext from **detected** MIME only; original filename metadata-only |
| **Storage under `public/`** | Irreversible public URL | **`MediaStorage.put`** outside web root; serve via ownership-checked Route Handler (US-3.3 pattern) |
| **Own-avatar upload without consent** | Likeness production after revoke | When reel **`visualMode === 'own_avatar'`**: **`assertActiveAvatarConsentForJobs(clientId)`** before accept — manual bypasses **cost**, not consent |
| **Budget blocks manual at API cap** | Operator dead-end when API spend exhausted | **`estimatedCostCents: 0`** path must **succeed** even when cumulative API spend at Reel cap; explicit test; **`assertVideoJobBudgetAllowsSpend`** with 0 must not block (CONTRACT freezes call-or-skip — either is OK if 0 never blocks) |
| **Non-zero spend smuggled as manual** | Margin fraud | **`actual_cost_cents = 0`**, **`estimated_cost_cents = 0`**, **`finalizeGenerationCost`** with **`manualActualCostCents: 0`**; no vendor I/O; adapter **`estimateCost` → 0** |
| **Missing Operator attribution** | Unauditable manual jobs | **`operator_client_id`** non-null on **`provider_key = 'manual'`** rows; set from **`requireOperator()`** session |
| **QA / approval bypass** | Non-compliant Reel ships | US-8.3 **must not** add approval/QA skip flags; manual jobs appear in Operator job panel; US-10.1 / US-11.x gates remain downstream |
| **Duplicate in-flight jobs** | Race / double output | Reject upload when slot has **`queued`/`processing`** job; V1 block replace on **`completed`** API output unless CONTRACT adds explicit replace (P1 defer) |
| **Manual adapter poller coupling** | Accidental async path / double finalize | **`createJob` / `getJobStatus` / `fetchAsset`** throw **`MANUAL_UPLOAD_SYNC_ONLY`**; orchestrator owns I/O; **no** **`enqueueVideoJobPoll`** |
| **Malware in uploaded video (residual)** | Server-side FFmpeg/processing risk | Same US-3.3 residual acceptance — magic bytes + size + type deny; optional hook only |

**Residual risk accepted:** Operator trust — Operators may upload arbitrary validated MP4/MOV within caps (product intent). Productized AV scanning deferred (US-3.3). Replace completed API output in-place deferred P1. UUID guessing on reel/job ids mitigated by ownership checks + 404. V1 **`LocalDiskStorage`** acceptable for dev; production migrates via **`S3Storage`** swap without client changes.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Uploaded manual video bytes | **High** — production raw input; potentially likeness | Browser multipart → server validator → `MediaStorage`; never `public/` |
| `neuramark_media_assets` (`generated_video`) | **High** — maps Cliente → storage key | Service-role INSERT; `client_id` from reel ownership |
| `neuramark_video_jobs` (manual rows) | **High** — production state + audit | Orchestrator INSERT terminal **`completed`**; **`operator_client_id`** for attribution |
| `operator_client_id` | Medium — accountability | From **`requireOperator()`** only |
| `storage_key` | High — indirect path to bytes | Server-generated only |
| `parent_job_id` (optional lineage) | Medium | Server validates same `reel_script_id` as parent failed job |
| Session cookie (Operator) | High — US-14.5 | `requireOperator` on upload action |
| Service-role key | Critical | Node only |

**Boundaries:**

1. **Browser (Operator) → `uploadManualVideoJob` Server Action** — Untrusted: file bytes, `reelScriptId`, `clientId`, optional `parentJobId`, original filename. **`requireOperator('action')`** first. **`clientId` + `reelScriptId`** validated server-side as consistent pair. Forbidden: status, provider, cost, output ids, `external_job_id`.
2. **Orchestrator → shared validator → `MediaStorage.put` → DB** — Trusted server pipeline only. No client influence on storage path, MIME trust, or duration outcome.
3. **Orchestrator → `neuramark_video_jobs` INSERT** — Single sync transaction path sets **`status: completed`**, **`provider_key: manual`**, **`output_media_asset_id`**, costs **0**, **`operator_client_id`**. **Not** a client UPDATE — does not weaken US-8.4 “no client status mutation” rule.
4. **Manual adapter registry** — **`estimateCost` → 0** for previews; vendor I/O methods throw — prevents accidental poller invocation.
5. **Browser (Cliente) → manual upload** — **No boundary** — route/action absent; **403** if invoked.
6. **Downstream US-9.1 / US-10.1** — Consumes **`output_media_asset_id`** like API jobs; QA/approval gates unchanged.

---

## Abuse Cases Considered

- *As a Cliente, I call `uploadManualVideoJob` to upload my own video* → **Blocked:** **`requireOperator`** → **403**; no Cliente upload surface.
- *As a malicious actor, I pass `{ clientId: victim, reelScriptId: myReel }`* → **Blocked:** reel load requires **`reel_script.id = $reelScriptId AND client_id = $clientId`**; inconsistent pair → **404**.
- *As a malicious actor, I upload to another tenant's reel with a guessed UUID* → **Blocked:** ownership query; foreign → **404** (not 403 enumeration).
- *As a malicious actor, I POST `{ status: 'completed', providerKey: 'manual', outputMediaAssetId: '…' }`* → **Blocked:** forbidden fields on upload schema; orchestrator sets job fields server-side only.
- *As a malicious actor, I supply `externalJobId` to collide with API jobs* → **Blocked:** forbidden field; server generates **`manual-{uuid}`**.
- *As a malicious actor, I upload `Content-Type: video/mp4` with HTML/SVG payload* → **Blocked:** magic-byte allowlist for **`generated_video`**; video signatures only.
- *As a malicious actor, I upload a 500 MB file* → **Blocked:** **`getMaxVideoBytes()`** before persist.
- *As a malicious actor, I upload a 10-minute clip* → **Blocked:** duration probe; **`DURATION_EXCEEDED`** when over cap.
- *As a malicious actor, I set filename `../../etc/passwd`* → **Blocked:** UUID storage key; original name metadata-only.
- *As a malicious actor, I upload manual video for `own_avatar` reel after consent revoke* → **Blocked:** **`assertActiveAvatarConsentForJobs`** on orchestrator path.
- *As an Operator, I upload manual when API spend exhausted budget* → **Allowed:** zero estimate must not block — production continuity intent.
- *As a malicious actor, I use manual upload to skip QA and publish* → **Blocked:** no QA skip in US-8.3; approval remains US-11.x; US-10.1 checks still required downstream.
- *As a malicious actor, I invoke manual adapter `createJob` via registry to bypass upload validator* → **Blocked:** adapter I/O throws **`MANUAL_UPLOAD_SYNC_ONLY`**; orchestrator is sole manual create path.
- *As a malicious actor, I upload while another job is `processing`* → **Blocked:** slot guard rejects in-flight jobs.
- *As a malicious actor, I pass `parentJobId` from another reel* → **Blocked:** parent must match same **`reel_script_id`** and terminal **`failed`** (or CONTRACT-allowed state).
- *As a malicious actor, I read `storage_key` from upload success DTO* → **Blocked:** minimal DTO — **`jobId`**, **`mediaAssetId`**, status only; no keys/paths.
- *As a malicious actor, I CSRF upload from evil.example* → **Blocked:** Server Action session + origin checks; Operator session required.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-8.3 are binding. Items marked **(added)** are new in this review — paste into USER_STORIES when the PO next edits. Do not drop or weaken existing `[SEC]` lines.

**Inherited (still binding — do not weaken upstream paths):**

- [ ] **[SEC] US-3.3 shared upload stack floors** — magic-byte MIME, server UUID `storage_key`, storage outside web root, ownership-checked serve, `MediaStorage` server-only, parameterized SQL, RLS deny-by-default *(US-3.3)*
- [ ] **[SEC] US-8.4 closed status-write surface** — no client-callable endpoint UPDATEs job status; manual completes via orchestrator INSERT-at-terminal, not browser UPDATE *(US-8.4)*
- [ ] **[SEC] Active avatar consent re-check when `own_avatar`** — **`assertActiveAvatarConsentForJobs`** *(US-3.2 / US-8.2)*
- [ ] **[SEC] Operator-only mutations use `requireOperator('action'|'handler')` first** *(US-14.5)*
- [ ] **[SEC] `provider_key` never client-supplied on production paths** — manual rows set **`provider_key = 'manual'`** server-side only *(US-7.2 / US-8.1)*
- [ ] **[SEC] `manual` never auto-selected by policy engine** — explicit Operator upload only *(US-7.2)*

**US-8.3 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] Manual upload applies the same file validation stack as US-3.3 (size limit, video MIME allowlist via magic bytes, server-generated storage key, storage outside web root)** *(USER_STORIES US-8.3)*
- [ ] **[SEC] Manual uploads are restricted to the Operator role and recorded with uploader identity, so `manual` provider jobs are attributable** *(USER_STORIES US-8.3)*
- [ ] **[SEC] A manual job still goes through QA (US-10.1) before approval — the manual path bypasses cost, not compliance** *(USER_STORIES US-8.3)*

**Added in this review (binding for US-8.3 BUILD):**

- [ ] **[SEC] (added) Operator gate on upload:** **`uploadManualVideoJob`** Server Action calls **`requireOperator('action')`** as **first** await; non-operator → **403** with no storage write, no DB INSERT; no parallel Cliente upload Route Handler
- [ ] **[SEC] (added) Tenancy / IDOR on reel slot:** orchestrator loads **`neuramark_reel_scripts`** with **`WHERE id = $reelScriptId AND client_id = $clientId`**; both ids validated as consistent pair from Operator scripts context; foreign or mismatched → **404** / domain error; parameterized queries only
- [ ] **[SEC] (added) Forbidden fields on upload request schema:** reject **`FORBIDDEN_FIELDS`**: `status`, `outputUrl`, `output_url`, `outputMediaAssetId`, `output_media_asset_id`, `providerKey`, `provider_key`, `externalJobId`, `external_job_id`, `estimatedCostCents`, `actualCostCents`, `operatorClientId`, `operator_client_id`, `storageKey`, `storage_key`, `skipConsentCheck`, `skipBudgetCheck`, `skipQa`, `confirmUpload` without boolean true if CONTRACT requires explicit confirm
- [ ] **[SEC] (added) Extend shared validator for `generated_video`:** export from **`lib/media/upload-validation.ts`** (or shared module) with **`assetType: 'avatar_reference' | 'generated_video'`** union; for **`generated_video`**: **skip** avatar-reference consent/count gates; enforce **video MIME only** (`video/mp4`, `video/quicktime`) via magic bytes; size ≤ **`getMaxVideoBytes()`**; **duration probe required** — reject when **`durationSec > getMaxVideoDurationSec()`** (default **30s**); same UUID key + `MediaStorage.put` pipeline — **no forked duplicate validator**
- [ ] **[SEC] (added) Duration probe server-side only:** probe runs on validated buffer/temp path before persist; library choice frozen in CONTRACT (`mp4box`, `ffprobe`, or equivalent); probe failure → **`INVALID_FILE_TYPE`** or **`DURATION_EXCEEDED`** — no partial persist
- [ ] **[SEC] (added) Sync orchestrator gate order:** **`uploadManualVideoJob()`** — (1) **`requireOperator`** (capture **`operatorClientId`**); (2) load reel script + verify **`client_id`**; (3) reject if in-flight job **`queued`/`processing`** for slot; (4) if **`own_avatar`** → **`assertActiveAvatarConsentForJobs(clientId)`**; (5) run shared validator **`generated_video`**; (6) **`MediaStorage.put`**; (7) INSERT **`neuramark_media_assets`** (`asset_type = generated_video`, metadata includes **`source: 'manual_upload'`**, **`durationSec`**, **`detectedMime`**, **`sizeBytes`**, sanitized **`originalFilename`**); (8) INSERT **`neuramark_video_jobs`** terminal row; (9) **`finalizeGenerationCost({ mode: 'sync_insert', providerKey: 'manual', manualActualCostCents: 0, actualCostCents: 0, ... })`**; (10) return minimal success DTO — **no** **`enqueueVideoJobPoll`**
- [ ] **[SEC] (added) Manual job row shape (server-written only):** `provider_key = 'manual'`, `provider_tier = 'low'`, `asset_role = 'primary'`, `status = 'completed'`, `estimated_cost_cents = 0`, `actual_cost_cents = 0`, `output_media_asset_id` set, `external_job_id = 'manual-' || uuid`, **`operator_client_id = operatorClientId`** non-null; optional **`parent_job_id`** only when parent exists, same **`reel_script_id`**, and parent is terminal **`failed`** (or CONTRACT-exact); **`attempt`** = 1 standalone or **`parent.attempt + 1`** when parent linked
- [ ] **[SEC] (added) Migration + attribution constraint:** **`ALTER neuramark_video_jobs ADD operator_client_id uuid REFERENCES neuramark_clients(id)`** nullable; application validation (or CHECK) requires **`operator_client_id IS NOT NULL` when `provider_key = 'manual'`**; value from **`requireOperator()`** only
- [ ] **[SEC] (added) Zero-cost budget semantics:** manual upload with **`estimatedCostCents: 0`** **must succeed** when Reel cumulative API spend is at **`max_cost_cents`** cap; automated test required; spend ledger records **`actual = 0`** via **`manualActualCostCents: 0`**
- [ ] **[SEC] (added) Manual adapter registry safety:** **`createManualUploadAdapter()`** in **`import "server-only"`** module; **`estimateCost` → 0**; **`createJob` / `getJobStatus` / `fetchAsset`** throw **`MANUAL_UPLOAD_SYNC_ONLY`** — prevents poller/worker from treating manual as async vendor job
- [ ] **[SEC] (added) No QA / approval bypass in BUILD:** US-8.3 code **must not** set QA pass flags, approval status, or publish-ready state; **must not** expose `skipQa` / `autoApprove` parameters; document downstream mandatory US-10.1 / US-11.x gates in CONTRACT non-goals
- [ ] **[SEC] (added) Media asset type correction:** **`insertGeneratedVideoMediaAsset`** uses **`asset_type = 'generated_video'`** (not **`avatar_reference`** hack); metadata **`source: 'manual_upload'`** distinguishes from API **`fetchAsset`** outputs
- [ ] **[SEC] (added) Serve / access for `generated_video`:** reuse authenticated media serve Route Handler from US-3.3 with ownership check **`WHERE id = $assetId AND client_id = $reelOwnerClientId`**; **`Cache-Control: private, no-store`**; DTOs omit **`storage_key`**; Operator preview uses same-origin authenticated fetch only
- [ ] **[SEC] (added) Replace-in-place guard (V1):** block manual upload when slot has **`completed`** API job unless CONTRACT explicitly adds audited replace flow (P1 defer); prevent silent overwrite of vendor output without Operator intent
- [ ] **[SEC] (added) UI security bar:** Operator-only **`/operator/scripts`** surface; EN+ES error strings for validation failures; filenames rendered as React text — no **`dangerouslySetInnerHTML`**; no **`storage_key`**, **`external_job_id`**, or raw paths in UI
- [ ] **[SEC] (added) Residual malware risk documented:** V1 relies on magic bytes + size + video-only allowlist — **no** productized virus scanner; optional **`afterValidate`** hook OK; US-9.x FFmpeg must treat bytes as untrusted
- [ ] **[SEC] (added) Automated security tests cover at least:** non-operator → **403**; foreign reel → **404**; mismatched `clientId`/`reelScriptId` → **404**; forbidden body fields rejected; oversize reject; bad magic bytes reject; duration exceeded reject; consent revoked + `own_avatar` → blocked; budget-at-cap + manual → **success**; job row has **`operator_client_id`**; costs **0**; no poller enqueue (mock/spy); adapter I/O throws; success DTO omits **`storage_key`**; in-flight job blocks upload; invalid **`parentJobId`** rejected

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Operator-only upload boundary — **APPROVE (hard)**

| Rule | Detail |
|---|---|
| Gate | **`requireOperator('action')`** first on **`uploadManualVideoJob`** |
| Surface | **`/operator/scripts`** **`ReelDetailPanel`** only — no Cliente routes |
| Failure | Non-operator → **403**; no side effects |

#### 2. Shared validation stack extension — **APPROVE WITH CONDITIONS (hard)**

| Step | `avatar_reference` | `generated_video` (US-8.3) |
|---|---|---|
| Consent / count | **`hasActiveAvatarConsent`** + max count | **Skip** (Operator path) |
| Size | image/video class caps | **`getMaxVideoBytes()`** only |
| Magic bytes | jpeg/png/webp/mp4/mov | **mp4 + quicktime only** |
| Duration | optional (3.3) | **Required** — ≤ **`getMaxVideoDurationSec()`** |
| Key + put | UUID + `MediaStorage.put` | **Same** |

**Condition:** Single module export — US-9.2 must import same stack later; no duplicate validation.

#### 3. Sync complete without client status writes — **APPROVE (hard)**

| Rule | Detail |
|---|---|
| Job creation | Orchestrator **INSERT** with **`status: completed`** in one transaction |
| Forbidden | Client UPDATE of **`neuramark_video_jobs.status`**; upload action accepting **`status`** |
| Poller | **Do not** **`enqueueVideoJobPoll`** for manual |
| US-8.4 compatibility | Manual path is **exception** to async applier — terminal state at INSERT, not client mutation |

#### 4. Attribution — **`operator_client_id`** — **APPROVE WITH CONDITIONS (hard)**

| Rule | Detail |
|---|---|
| Column | **`operator_client_id uuid REFERENCES neuramark_clients(id)`** nullable on table |
| Manual rows | **Non-null** when **`provider_key = 'manual'`** |
| Source | **`requireOperator()`** session id only |
| Audit | Queryable in Operator job panel / production list |

**Condition:** CONTRACT freezes CHECK vs app-only validation.

#### 5. Tenancy / IDOR — **APPROVE (hard)**

| Rule | Detail |
|---|---|
| Load | **`reel_script`** by id **and** **`client_id`** |
| Input | `reelScriptId` + `clientId` from Operator context — cross-checked server-side |
| Foreign | **404** uniform messaging |
| Parent job | **`parent_job_id`** must reference job on **same** **`reel_script_id`** |

#### 6. Consent vs cost bypass — **APPROVE (hard)**

| Bypass allowed | Bypass forbidden |
|---|---|
| API **`estimated_cost_cents`** / vendor I/O | **`assertActiveAvatarConsentForJobs`** when **`own_avatar`** |
| Reel budget block for **0** estimate | US-10.1 QA checks |
| | US-11.x client approval |
| | File validation stack |

#### 7. Budget at cap — **APPROVE (hard)**

| Rule | Detail |
|---|---|
| Estimate | **0** cents always for manual |
| Gate | Must **not** block upload solely because prior API spend hit cap |
| Ledger | **`finalizeGenerationCost`** sync_insert with **`manualActualCostCents: 0`** |

#### 8. Manual adapter — **APPROVE (hard)**

| Method | Behavior |
|---|---|
| `estimateCost` | **`{ estimatedCostCents: 0 }`** |
| `createJob` / `getJobStatus` / `fetchAsset` | Throw **`MANUAL_UPLOAD_SYNC_ONLY`** |
| Registration | **`createProviderRegistry`** includes **`manual`** |

#### 9. In-flight / replace guards — **APPROVE WITH CONDITIONS**

| State | V1 behavior |
|---|---|
| `queued` / `processing` | **Reject** upload |
| `failed` | **Allow** (optional **`parent_job_id`**) |
| `completed` API job | **Block** replace unless P1 CONTRACT flow |

#### 10. Virus scanning — **APPROVE deferral (condition)**

Same as US-3.3 — document residual risk in CONTRACT; optional hook only.

---

### Required implementation constraints

1. All upload/orchestrator/adapter modules **`import "server-only"`**.
2. Extend **`validateAndPrepareMediaUpload`** — do not fork a second validator.
3. **`external_job_id`** server-generated **`manual-{uuid}`** only.
4. Switch **`insertGeneratedVideoMediaAsset`** to **`generated_video`** enum.
5. Reuse **`OperatorVideoJobSummaryPanel`** — no duplicate status authority in FE.
6. **`canRetry: false`** for **`provider_key = manual`** in mapper (US-8.4 pattern) — manual re-upload is separate action.
7. Migrations via Supabase only; **`neuramark_`** prefix.
8. Duration probe library must be justified in CONTRACT (no arbitrary shell from client input).

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Expose manual upload to Cliente sessions or skip **`requireOperator`** | **REJECT** |
| Trust client `Content-Type`, extension, or filename for storage path or MIME | **REJECT** |
| Accept `status`, `provider_key`, `output_media_asset_id`, or `external_job_id` from client | **REJECT** |
| Skip shared US-3.3 validator or write uploads under **`public/`** | **REJECT** |
| Skip duration probe for **`generated_video`** | **REJECT** |
| Omit **`operator_client_id`** on manual job rows | **REJECT** |
| Block manual upload when API budget exhausted (non-zero gate on 0 estimate) | **REJECT** |
| Skip **`assertActiveAvatarConsentForJobs`** for **`own_avatar`** reels | **REJECT** |
| Add QA skip / auto-approve / publish flags on manual path | **REJECT** |
| **`enqueueVideoJobPoll`** for manual jobs | **REJECT** |
| Allow cross-tenant upload via unchecked `clientId` | **REJECT** |
| Return **`storage_key`** or absolute paths in client DTOs | **REJECT** |
| Implement manual completion as client UPDATE to **`neuramark_video_jobs`** | **REJECT** |

---

## Future-Proofing Notes

- **US-9.1 assembly** consumes **`output_media_asset_id`** identically for manual and API jobs — keep **`generated_video`** asset type stable.
- **US-10.1 QA** must treat manual jobs as first-class production inputs — no “manual exempt” rule in QA agent.
- **US-8.4 retry** remains API-only; manual re-upload is separate Operator action with lineage via optional **`parent_job_id`**.
- **Real auth:** **`operator_client_id`** and tenancy checks use session ids — same query shapes when hardcoded user replaced.
- **S3 migration:** **`storage_key`** remains opaque; serve Route Handler unchanged for Client Components.
- **Replace completed API output:** if added P1, require separate audited Operator action — not silent upload overwrite.
- **RLS:** **`neuramark_video_jobs`** / **`neuramark_media_assets`** deny-by-default; Node service-role only.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-8.3/CONTRACT.md` exists, verify before coding proceeds:

- [ ] **`uploadManualVideoJob`** Server Action — gate order, forbidden fields, multipart handling
- [ ] Validator extension — **`generated_video`** branch, duration probe, env caps
- [ ] **`uploadManualVideoJob()`** orchestrator module — sync INSERT path, no poller
- [ ] **`createManualUploadAdapter()`** — registry, sync-only throws
- [ ] Migration — **`operator_client_id`** + manual non-null rule
- [ ] Job row + media asset INSERT shapes; **`external_job_id`** generation
- [ ] **`finalizeGenerationCost`** sync_insert with **`manualActualCostCents: 0`**
- [ ] Budget-at-cap test case documented
- [ ] IDOR / tenancy queries; 404 foreign reel
- [ ] In-flight / completed replace guards
- [ ] FE DTO refresh — minimal success shape; reuse **`OperatorVideoJobSummaryPanel`**
- [ ] Non-goals: Cliente upload, QA skip, poller, replace-in-place V1
- [ ] Residual malware risk note
- [ ] Security test matrix for SEC rows above

---

## CONTRACT freeze list (binding summary)

1. **Operator gate:** **`requireOperator`** first; **403** non-operator; no Cliente upload surface.  
2. **Validator:** extend US-3.3 stack for **`generated_video`** — video magic bytes, size, **duration probe**, UUID key, **`MediaStorage.put`** outside **`public/`**.  
3. **Tenancy:** reel **`client_id`** + **`reelScriptId`** server cross-check; foreign → **404**.  
4. **Forbidden client fields:** status, provider, costs, output ids, **`external_job_id`**, storage keys, skip flags.  
5. **Sync orchestrator:** INSERT terminal **`completed`** job + media + spend **0**; **no** poller enqueue.  
6. **Attribution:** **`operator_client_id`** required on **`provider_key = manual`**.  
7. **Consent:** **`assertActiveAvatarConsentForJobs`** when **`own_avatar`** — cost bypass only.  
8. **Budget:** **0** estimate never blocked by API cap exhaustion.  
9. **Compliance:** no QA/approval bypass; downstream US-10.1 / US-11.x unchanged.  
10. **Adapter:** **`estimateCost` → 0**; vendor I/O throws **`MANUAL_UPLOAD_SYNC_ONLY`**.  
11. **Tests:** operator 403, IDOR 404, validation, forbidden fields, budget-at-cap success, attribution, no poller.

---

## Open questions — SECURITY resolutions

| # | Question (TASKS.md) | Resolution |
|---|---|---|
| 1 | Validator module shape | **APPROVE PO lean:** extend **`validateAndPrepareMediaUpload`** with **`assetType`** union; branch consent/count only for **`avatar_reference`** |
| 2 | Duration probe library | **APPROVE** server-side probe required in US-8.3 — CONTRACT freezes library (`mp4box` / `ffprobe` / equivalent); reject over cap before persist |
| 3 | Replace completed API output | **APPROVE P1 defer** — V1 block upload when **`completed`** unless explicit audited replace story |
| 4 | `parent_job_id` after failure | **APPROVE optional** — validate same **`reel_script_id`** + terminal **`failed`** parent |
| 5 | Multipart / Vercel body limit | **APPROVE** enforce **`getMaxVideoBytes()`** in validator; CONTRACT documents Route Handler proxy if needed |
| 6 | Generated video serve route | **APPROVE** reuse US-3.3 authenticated serve with ownership check for reel owner's **`client_id`** |
| 7 | Manual job retry via US-8.4 | **APPROVE** **`canRetry: false`** for manual — re-upload via separate action |
| 8 | Budget gate call with 0 | **APPROVE** either call with 0 or skip — **must never block** manual solely due to prior API spend |

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — **nextjs-backend** (primary) and **media-pipeline-engineer** may author `plan/stories/US-8.3/CONTRACT.md`. Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above. Reconcile with US-8.4 closed write surface — manual sync INSERT is orchestrator-only, not a client UPDATE exception.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **Operator gate** + forbidden fields; (2) **shared validator extension** with duration probe; (3) **sync orchestrator** gate order + no poller; (4) **`operator_client_id`** attribution; (5) **IDOR-safe** reel load; (6) **consent** for **`own_avatar`**; (7) **budget-at-cap success** for 0 estimate; (8) **no QA skip**; (9) **manual adapter** sync-only throws; (10) security test matrix |
| **REDESIGN** | Cliente-callable upload; client-supplied **`provider_key`** / **`status`** / **`external_job_id`**; skip validation or consent; block manual at budget cap; missing attribution; client UPDATE job status |
| **VETO (do not BUILD)** | Any upload path without **`requireOperator`**; forked validator; storage under **`public/`**; manual jobs without **`operator_client_id`**; **`enqueueVideoJobPoll`** for manual; QA/auto-approve skip parameters |

**Recommended action:** Proceed to **CONTRACT.md** with **nextjs-backend** + **media-pipeline-engineer**; security-architect post-CONTRACT spot-check expected **APPROVE WITH CONDITIONS** when freeze list is encoded.
