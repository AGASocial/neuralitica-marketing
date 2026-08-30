## Spec Review — US-8.3

### Verdict: GAPS

US-8.3 intent — the **Operator** performs **Subida manual** when API **Job de generación** fails or budget blocks retry; upload bypasses **Política de costo** API charges (zero-cost **`manual`** proveedor) but **not** QA/compliance; file type, size, and duration are validated via the US-3.3 shared stack; uploader identity is recorded; downstream assembly treats the raw video like any provider output — is **directionally aligned** with SPEC §3 **Video Provider Adapter** (S3.M9: Operator upload manual bypass costo, no QA; `neuramark_video_jobs`; download-and-own; re-check consent+budget), SPEC §4 error paths (Operator ve job failed + upload manual), USER_STORIES § US-8.3 acceptance criteria, frozen **US-8.4** job DDL + status UI reuse, frozen **US-7.3** `manualActualCostCents: 0` / `sync_insert` seam, frozen **US-7.2** manual exclusion from auto-rank, frozen **US-3.3** shared `validateAndPrepareMediaUpload` export, and **ADR-0003** (sync upload + validation on Vercel; no poller enqueue for manual jobs).

**Gaps** sit between USER_STORIES § US-8.3 acceptance criteria / owner table and what must be frozen in **US-8.3 CONTRACT.md** / **SECURITY.md** before BUILD: upload Server Action (or Route Handler) contract, validator extension for `generated_video` + duration probe, `operator_client_id` migration rule, upload visibility when a `completed` API job already exists, budget gate behavior at zero estimate, media serve rules for `generated_video`, multipart/body limits on Vercel, and orchestrator transaction order (media INSERT → job INSERT → spend finalize). Story intent does not drift from SPEC; unresolved US-8.3-specific contract shape is the blocker — core dependencies are satisfied upstream.

**Upstream dependencies satisfied or frozen:** **US-8.1** ✅ (`VideoProviderAdapter` four-method contract; registry factory; **`manual` adapter explicitly deferred to US-8.3**). **US-8.4** ✅ (`neuramark_video_jobs` DDL; `OperatorVideoJobSummaryPanel`; batch map; `finalizeGenerationCost` async path; manual jobs reuse row shape, skip poller). **US-X.4** ✅ (catalog `manual` row, `unitCostCents: 0`, `manualFallback: true`). **US-7.2** ✅ (`manual` excluded from auto `resolveProvider`; `allowManualFallback` explicit path only). **US-7.3** ✅ (`manualActualCostCents: 0`; Phase B `sync_insert` rule). **US-3.3** ✅ (shared upload validator exported; magic bytes, size, server key, storage outside web root). **US-3.2** ✅ (`assertActiveAvatarConsentForJobs`). **US-14.5** ✅ (`requireOperator()` floor). **Partial / downstream:** **US-9.1** (assembly consumes `output_media_asset_id` + `generated_video`) · **US-10.1** (QA gate after manual — SEC AC, not US-8.3 BUILD body) · **US-7.4** (roll-up includes `$0.00` manual rows).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **No US-8.3 CONTRACT.md.** AC spans operator-only upload action, validator extension, migration, sync-complete orchestrator, spend `sync_insert`, and FE dialog — but only PREP README/TASKS sketches exist. BUILD cannot start without frozen signatures, error codes, DTO refresh, and multipart transport. | USER_STORIES US-8.3; US-8.4 CONTRACT job shape; US-3.3 CONTRACT validator export | Author **US-8.3 CONTRACT.md** — freeze **`uploadManualVideoJob()`** orchestrator, **`uploadManualVideoJob`** Server Action (or Route Handler if multipart), validator extension (`assetType: generated_video`), **`operator_client_id`** migration, gate order, error enum, FE action consumer, batch-map refresh pattern. |
| **High** | **`operator_client_id` attribution rule not frozen.** SEC AC: manual jobs attributable with uploader identity. PREP adds nullable column + “non-null when `provider_key = manual`” — CHECK vs app-only validation, FK to `neuramark_clients`, and query surface for audit are unspecified. | USER_STORIES US-8.3 [SEC]; SPEC §6 sensitive data server-only | CONTRACT: migration **`operator_client_id uuid REFERENCES neuramark_clients(id)`**; freeze **DB CHECK** `(provider_key <> 'manual' OR operator_client_id IS NOT NULL)` **or** documented app validation with integration test; value from **`requireOperator()`** session only; Operator-only read on job DTO for audit. |
| **High** | **Upload when slot already `completed` (API) undefined for V1.** PO lean: P1 defer replace-in-place; V1 upload only when no in-flight job. If API job is **`completed`** but output is unusable, Operator may have no manual path without replace flow — tension with SPEC §4 “upload manual” as production escape hatch. | SPEC §4 error paths; USER_STORIES US-8.3 scope; README PO #42 | CONTRACT: freeze V1 visibility — **(A)** block upload when any `completed` job exists for slot (document Operator must use QA/reject/regenerate paths first) **or** **(B)** allow upload when `completed` + explicit Operator intent flag (P1). Pick one; FE visibility rules must match. |
| **High** | **`generated_video` serve / ownership rules unset.** Open Q8: reuse US-3.3 authenticated serve Route Handler — extend ownership for `generated_video` operator/client scope. Without freeze, manual output may be unreadable by assembly (US-9.1) or Operator preview. | USER_STORIES US-8.3 AC downstream assembly; US-3.3 SECURITY serve rules; TASKS open Q8 | SECURITY + CONTRACT: freeze serve Route Handler allowlist for **`asset_type = generated_video`** — Operator + owning `client_id` service paths; same ownership check as portrait assets; **no** anonymous/public serve. |
| **Medium** | **Validator extension shape open.** Open Q1: extend **`validateAndPrepareMediaUpload`** with `generated_video` union vs sibling module. US-3.3 SECURITY requires US-8.3/US-9.2 import **same** module — fork risks drift from SEC AC. | USER_STORIES US-8.3 [SEC]; US-3.3 SECURITY L298; TASKS open Q1 | CONTRACT: single export with **`assetType: 'avatar_reference' \| 'generated_video'`**; branch consent/count gates only for `avatar_reference`; **`generated_video`**: video MIME magic bytes (`mp4`, `quicktime`), **`getMaxVideoBytes()`**, **duration probe** ≤ **`getMaxVideoDurationSec()`** (default 30s). |
| **Medium** | **Duration probe library/runtime not frozen.** Open Q2: `mp4box` vs `ffprobe` shell. Probe must run server-side before persist; affects Vercel bundle/time limits for 50 MiB cap. | USER_STORIES US-8.3 AC file type + duration; TASKS open Q2; ADR-0003 (heavy work off Vercel for polls — probe is lighter) | CONTRACT: freeze library + max buffer read; reject **`DURATION_EXCEEDED`** before `MediaStorage.put`; unit tests with fixture buffers; document env dependency if `ffprobe` required. |
| **Medium** | **Budget gate at zero estimate not frozen.** PO lean: call **`assertVideoJobBudgetAllowsSpend`** with 0 for audit **or** skip when estimate is 0 — must **never** block manual solely because prior API spend exhausted cap. US-7.1 documents manual skip seam for US-8.3. | SPEC §3 Cost Policy; USER_STORIES US-8.3 AC bypass cost; US-7.1 CONTRACT manual skip; README PO #6 | CONTRACT: explicit rule — **`estimatedCostCents === 0`** → gate **always passes** (dedicated branch or documented skip); integration test: cumulative spend at cap + manual upload succeeds. |
| **Medium** | **Multipart / body size limit on Vercel unspecified.** Open Q5: Server Action vs Route Handler for large video POST; Vercel body limits vs **`getMaxVideoBytes()`** (50 MiB default). Risk: action fails before validator runs. | TASKS open Q5; SPEC §5 Vercel hosting | CONTRACT: freeze transport — if Server Action body limit < max video size, use Route Handler proxy with same auth gates; document max body; validator rejects oversize with **`FILE_TOO_LARGE`** regardless of transport. |
| **Medium** | **Orchestrator transaction order + idempotency not frozen.** Gate order in README is clear, but single-transaction vs storage-then-DB rollback, duplicate upload on retry, and **`spend_event_id`** linkage on manual job row are unspecified. US-8.4 API jobs link spend at create. | US-8.4 CONTRACT create path; US-7.3 `finalizeGenerationCost` sync_insert | CONTRACT: freeze — storage put → media INSERT → job INSERT (`status: completed`, `output_media_asset_id`) → **`finalizeGenerationCost({ mode: 'sync_insert', manualActualCostCents: 0, actualCostCents: 0, providerKey: 'manual', assetRole: 'talking_head' })`** → UPDATE job `spend_event_id`; failed DB after put → orphan file policy (delete blob or sweeper). |
| **Medium** | **FE batch map refresh pattern not frozen.** Open Q6: `revalidatePath` vs return updated **`OperatorVideoJobSummaryDto`** from action — must mirror US-8.4 retry success. | US-8.4 FE patterns; TASKS open Q6 | CONTRACT: pick one refresh contract; FE must show **`completed`** manual job with **`$0.00`** via existing **`OperatorVideoJobSummaryPanel`** — no duplicate badge component. |
| **Low** | **USER_STORIES Depends line understates deps.** Depends: **US-8.1** only. PREP correctly lists US-8.4, US-X.4, US-7.2, US-7.3, US-3.3, US-3.2, US-14.5 — all required for BUILD. | USER_STORIES US-8.3 Depends; README Depends table | Amend USER_STORIES Depends when PO next edits; CONTRACT lists full dependency freeze — BUILD blocked only on listed ✅ stories. |
| **Low** | **USER_STORIES DB row uses `video_jobs` not `neuramark_video_jobs`.** Canonical table is **`neuramark_video_jobs`** per SPEC §6 + US-8.4 migration. | SPEC §6 `neuramark_*`; AGENTS.md; US-8.4 DDL | CONTRACT uses **`neuramark_video_jobs`** + **`neuramark_media_assets`** exclusively; amend USER_STORIES DB row on next PO edit. |
| **Low** | **`insertGeneratedVideoMediaAsset` enum hack in scope.** Current code inserts `avatar_reference` + `generatedVideo: true` metadata — US-8.3 switches to **`generated_video`** enum (already in US-8.4 migration). Must not break existing SadTalker poller path during transition. | README PO #9; US-8.4 migration `generated_video` enum | CONTRACT: migration-safe switch + update poller/finalize paths to use `generated_video`; regression test on API-completed job shape. |
| **Info** | **SPEC hard rules intact.** Manual path does not publish to Instagram (SC-2), does not require human Cliente recording, does not skip QA before **Aprobación** (SEC AC + SPEC §3 S3.M9 “no QA” = bypass QA **agent override**, not skip compliance gate), does not conflate Playbook vs Trend, does not introduce Stories/multicanal/ads/RBAC UI. | SPEC §1 SC-1–SC-4; SPEC §3 S3.M9, S3.M11; SPEC §1 fuera de alcance | SECURITY.md must document US-10.1 downstream gate — manual jobs enter same assembly → QA pipeline as API jobs. |
| **Info** | **Operator-only role correct.** SPEC §2 acciones solo Operator include reintentos/intervención jobs; manual upload is Operator escape hatch, not Cliente self-service. `requireOperator()` on Server Action matches SPEC + AGENTS.md. | SPEC §2; CONTEXT Operator; README scope out Cliente surfaces | No Cliente upload routes; no client-supplied `provider_key` or `external_job_id`. |
| **Info** | **ADR-0003 compliant for manual path.** Sync complete on Vercel (validate → storage → DB) without **`enqueueVideoJobPoll`**; no long-running provider poll on serverless. Assembly/FFmpeg remains US-9.x on Fly.io. | ADR-0003; README PO #4; US-8.4 manual skip poller | Manual adapter vendor I/O methods throw **`MANUAL_UPLOAD_SYNC_ONLY`** — documents adapter completeness without poller coupling. |
| **Info** | **Cost bypass semantics aligned.** `estimated_cost_cents = 0`, `actual_cost_cents = 0`, `finalizeGenerationCost` with **`manualActualCostCents: 0`** — matches SPEC “bypass costo” and US-7.3 manual rule. Cliente never sees cost fields. | SPEC §3 S3.M8–M9; US-7.3 CONTRACT Phase B manual rule | Do not expose cost on Cliente serializers; Operator panel shows **`$0.00`** via US-8.4 cost DTO. |
| **Info** | **Consent gate preserved for avatar propio.** Manual bypasses API cost, not **`assertActiveAvatarConsentForJobs`** when visual mode is **`own_avatar`** — aligns with SPEC §3 Avatar/Visual Mode and US-3.2. | SPEC §3 S3.M4; README PO #7; USER_STORIES US-8.3 scope out | CONTRACT: consent runs before file accept; **`OWN_AVATAR_CONSENT_REQUIRED`** error code. |
| **Info** | **Out of scope held:** API adapter bodies (US-8.2/8.5–8.7), new poller/status UI, Cliente upload, QA override UI, auto-rank `manual` in policy, assembly FFmpeg body, productized AV scanning, HeyGen fallback. | README scope out; TASKS out of scope | US-8.3 = manual adapter + sync orchestrator + Operator upload dialog — not second job system. |

---

### Terminology violations (CONTEXT)

**None that block** in USER_STORIES § US-8.3 or PREP README/TASKS (uses **Operator**; technical `video_jobs` table name is naming drift — see Low finding — not a CONTEXT _Evitar_ synonym in user-facing copy).

Product-facing EN/ES for US-8.3 UI must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Subida manual** (ES) | treating upload as Cliente self-service |
| **Proveedor manual** / **manual** (technical key only) | client-supplied `provider_key` in UI |
| **Job de generación** | generation job (user-facing EN) |
| **Operator** | admin, administrador, staff |
| **download-and-own** (technical/docs) | exposing raw storage paths or client filenames in UI |
| **Coste cero** / zero API cost (footnote context) | implying QA or compliance is skipped because upload was manual |

Technical enums (`generated_video`, `manual`, `completed`, `operator_client_id`) OK in code and Operator diagnostics; map to localized labels in FE. **`resolveProviderDisplayLabel`** already maps `manual` → “Manual upload” (EN); ES keys under **`scripts.videoJob.manualUpload.*`** should use **Subida manual** per README canonical terms.

Do **not** expose raw client filenames as storage paths; do **not** label manual upload as bypassing **Veredicto QA** or **Aprobación**.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-8.3 CONTRACT.md (action, orchestrator, validator, migration) | **Yes — BUILD gate** | Freeze signatures, error codes, gate order, DTO refresh. |
| `operator_client_id` migration + attribution rule | **Yes — [SEC] AC** | DB or app rule; Operator session only. |
| `generated_video` validator + duration probe | **Yes — AC + [SEC]** | Extend US-3.3 shared module; no fork. |
| Budget gate at zero estimate | **Yes — AC** | Never block manual when API cap exhausted. |
| Upload visibility when `completed` job exists | **Yes — UX / SPEC §4** | Freeze V1 replace policy before FE BUILD. |
| `generated_video` serve Route Handler rules | **Yes — downstream US-9.1** | SECURITY + CONTRACT ownership extension. |
| Multipart / Vercel body limit | **Yes — BE** | Route Handler if action too small. |
| SECURITY.md (operator gate, validation, QA downstream) | **Yes — orchestrator gate** | Before CONTRACT freeze or in parallel. |
| US-9.1 assembly consumption | **No — downstream** | Same `output_media_asset_id` shape as API jobs. |
| US-10.1 QA gate body | **No — downstream** | Document in SECURITY; no bypass in US-8.3 BUILD. |

**SPEC blockers on intent:** none. **ADR breaches:** none if manual path stays sync on Vercel without poller enqueue and assembly stays on Fly.io.

---

### Recommended action

Proceed to **SECURITY.md** then **US-8.3 CONTRACT.md** with these **non-negotiable freezes**:

1. **`uploadManualVideoJob()`** — Operator-only; gate order (identity → script scope → consent if `own_avatar` → validate → storage → media → job `completed` → spend `sync_insert`); **no** `enqueueVideoJobPoll`.
2. **Shared validator extension** — `generated_video` MIME magic bytes, size cap, duration probe; import path stable for US-9.2.
3. **`operator_client_id`** — required on `provider_key = manual`; from `requireOperator()` only.
4. **Budget** — zero estimate never blocked by cumulative API spend at cap.
5. **Upload visibility** — explicit rule for `completed` / `failed` / in-flight slots; optional `parent_job_id` lineage from failed API job.
6. **Serve rules** — authenticated ownership-checked serve for `generated_video` assets.
7. **FE** — reuse **`OperatorVideoJobSummaryPanel`**; i18n **`scripts.videoJob.manualUpload.*`** EN/ES; batch map refresh contract.
8. **Phased acceptance** — US-8.3 BUILD does not require US-8.5–8.7 adapters; SadTalker/manual coexist on same job table.

**Gate status:** SPEC-REVIEW **GAPS** (intent aligned; CONTRACT/SECURITY freezes required). Next: security-architect **SECURITY.md** → nextjs-backend **CONTRACT.md** (Reviewed by FE) → BUILD.
