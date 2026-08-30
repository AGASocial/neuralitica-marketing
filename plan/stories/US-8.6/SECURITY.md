# Security Design Review — US-8.6

**Story:** US-8.6 — MuseTalk adapter (low-tier talking-head alternative)  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Sources:** `plan/stories/US-8.6/README.md`, `plan/stories/US-8.6/TASKS.md`, `plan/USER_STORIES.md` (US-8.6 AC + `[SEC]`), `plan/stories/US-8.2/SECURITY.md` + `CONTRACT.md` (SadTalker adapter pattern, asset URL resolver, download-and-own), `plan/stories/US-8.4/SECURITY.md` (job orchestration, poller-only writes, retry gates), `plan/stories/US-3.4/SECURITY.md` (generic-avatar disclosure, non-overridable QA class), `plan/stories/US-8.1/SECURITY.md` (adapter boundary, normalization), `plan/stories/US-7.2/SECURITY.md` (policy engine, forbidden client `providerKey`), `plan/stories/US-7.1/SECURITY.md` (budget gate), `plan/stories/US-X.4/SECURITY.md` (`musetalk_low` catalog, `REPLICATE_API_TOKEN`), `lib/providers/video/sadtalker-low-adapter.ts`, `lib/video-jobs/create-talking-head-video-job.ts`, `lib/media/resolve-media-asset-url-for-provider.ts`, `app/api/media/provider-assets/[assetId]/route.ts`, `lib/media/has-reference-loop-asset-for-client.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementer:** **media-pipeline-engineer** (MuseTalk/Replicate adapter, `fetchAsset`, mocked-HTTP tests). **nextjs-backend** co-authors `CONTRACT.md` for orchestrator Phase B, reference-loop asset resolver, and registry wiring. **nextjs-frontend:** N/A — reuses US-8.4 provider-agnostic status UI.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: a **second real Replicate adapter** for `musetalk_low`, mirroring the **US-8.2 SadTalker security pattern** (server-only token, signed tenant asset URLs, allowlisted output download, mandatory normalizers, download-and-own), wired into the **existing US-8.4 orchestration** without new client write surfaces or FE scope. Phase B correctly **server-resolves** the reference-loop video asset instead of trusting client asset selection — the main new trust boundary beyond SadTalker.

No REDESIGN. The four primary MuseTalk-specific threats — **client authority over loop video**, **dual-input SSRF (video + audio URLs)**, **own_avatar / consent path confusion**, **generic-avatar disclosure bypass** — are addressable with concrete acceptance criteria inherited from US-8.2/US-8.4 and extended below. Orchestrator may proceed to **CONTRACT.md** after encoding the items below.

**Primary threats modeled:**

| Threat | Abuse class |
|---|---|
| **Client picks reference-loop video** | Smuggle another tenant's loop id (IDOR), non-video MIME, or wrong loop to bypass policy intent; force MuseTalk when policy expects SadTalker |
| **Dual-input SSRF** | Adapter or orchestrator passes client-supplied HTTPS URLs for **video** or **audio** to Replicate; compromised Replicate output URL triggers internal fetch |
| **own_avatar + MuseTalk combo** | Use loop lip-sync on likeness without active consent; route around SadTalker consent gate |
| **Disclosure / impersonation bypass** | Treat MuseTalk output as exempt from US-3.4 `must_disclose_not_owner` QA blocking class |
| **Provider key / asset-path smuggling** | Client supplies `referenceVideoAssetId` + `portraitAssetId` to confuse orchestrator; force `musetalk_low` while policy selected SadTalker |

**Inherited floors (US-8.1 / US-8.2 / US-8.4 / US-7.2 / US-7.1 / US-3.4 / US-X.4 — do not weaken):** registry lookup from `resolveProviderForJob` output only; `FORBIDDEN_PROVIDER_AUTHORITY_KEYS` + `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` on job-create paths; `normalizeVideoJobStatusResult` / `sanitizeProviderErrorMessage` / `validateProviderOutputUrl` mandatory; `rawOutputUrl` transient and non-persistent; poller-only status writes; budget + consent gates immediately before `createJob`; IDOR-safe Cliente poll → 404; `REPLICATE_API_TOKEN` server-only; vendor HTTP only under `lib/providers/**`; interim hardcoded user is sanctioned — not a finding.

**This story owns:** Real **`musetalk_low`** adapter; `lib/contracts/musetalk-low.ts` constants; registry registration; **`getPrimaryReferenceLoopVideoAssetForClient`** (or CONTRACT-exact name); Phase B orchestrator branch for `musetalk_low`; extend **`resolveMediaAssetUrlForProvider`** (or injectable seam) for **video** input MIME allowlist; **`portrait_asset_id` semantic overload** documented for MuseTalk audit rows; security tests for loop resolution, dual-input SSRF rejection, and provider-path guards.

**This story does not own:** US-8.4 poller/retry/webhook modules (consume as-is); SadTalker adapter body changes beyond orchestrator branching; US-9.3 TTS orchestration; US-10.1 QA agent job; US-10.2 override handler; operator SadTalker↔MuseTalk override UI (P1 defer); Wan/HeyGen adapters; FFmpeg assembly; new FE; `neuramark_video_jobs` DDL migration.

---

### Threat Summary (US-8.6–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Client authority over loop video** | IDOR via guessed UUID; wrong loop selected; policy bypass | **`referenceVideoAssetId` is not client-writable authority** — orchestrator resolves via **`getPrimaryReferenceLoopVideoAssetForClient(clientId)`** (earliest video `avatar_reference` by `created_at ASC`, MIME ∈ `video/mp4` \| `video/quicktime`). Client request field **ignored or rejected** (CONTRACT picks one — see Design Concerns). Retry reuses **server-loaded** `portrait_asset_id` from failed job row (US-8.4 pattern), not client body |
| **Dual-input SSRF (video + audio)** | Server or Replicate fetches internal/metadata URLs | Both inputs resolved by **`resolveMediaAssetUrlForProvider`** with **kind-specific MIME allowlists** → HMAC-signed M1 URLs only. **Never** pass client `sourceUrl` / absolute URL strings. Output download: **`MUSETALK_ALLOWED_OUTPUT_HOSTS`** + same hardening as SadTalker (`validateProviderOutputUrl`, redirect cap, timeout, max bytes) |
| **Signed loop video URL leakage** | Long TTL URL for large reference video reused beyond Replicate create | Reuse **`SADTALKER_INPUT_URL_TTL_SEC`** (or CONTRACT-frozen MuseTalk TTL); M1 route requires valid HMAC + `exp`; **`Cache-Control: no-store`**; asset row scoped **`client_id`** on read |
| **own_avatar + MuseTalk** | Likeness generation without consent | Orchestrator **rejects** `musetalk_low` when `visualMode === own_avatar` or `modalidad === own_avatar`. MuseTalk path is **`generic_avatar` + reference loop** only. Consent gate unchanged for SadTalker `own_avatar` path |
| **Policy / provider mismatch** | SadTalker adapter invoked with loop assets or MuseTalk without loop | **`resolveProviderForJob`** output is sole `provider_key` authority. Orchestrator allows **`sadtalker_low` \| `musetalk_low`** only. **`musetalk_low`:** require `hasReferenceLoop` + resolved loop id. **`sadtalker_low`:** require portrait still; **reject** `referenceVideoAssetId` on adapter (unchanged). Adapter validates input matrix fail-closed |
| **portrait_asset_id semantic overload** | Wrong asset used on retry; cross-provider confusion | CONTRACT documents: MuseTalk rows store **reference-loop video** id in **`portrait_asset_id`**; SadTalker rows store **portrait still** id. Poller/adapter use **`provider_key`** from job row — never infer from column name alone. Retry loads assets from **failed job row + policy re-resolve** server-side |
| **Generic-avatar disclosure bypass** | Publish loop-lip-sync content without owner disclosure | Adapter **does not** clear or set `must_disclose_not_owner`. US-3.4 rules apply downstream (Script agent DTO, QA `generic_avatar_not_owner` **blocking** check). VALIDATION documents non-bypass — no adapter flag to skip QA |
| **API key leakage** | Same as US-8.2 — shared `REPLICATE_API_TOKEN` | Token loaded in **`musetalk-low-adapter.ts` only**; missing → **`PROVIDER_CONFIG_MISSING`**; never in DTOs/logs/errors |
| **Untrusted Replicate JSON** | Same as US-8.2 | Mandatory normalizers on all vendor payloads before persist/display |
| **Budget / consent bypass on MuseTalk create** | Submit loop job over cap or after revoke on wrong path | Same gate order as US-8.2/US-8.4: policy → estimate → **`assertReelBudgetAllowsSpend`** → consent (**own_avatar** only — N/A for MuseTalk path) → **`adapter.createJob`**. Retry inherits US-8.4 full gates |

**Residual risk accepted:** Earliest-loop selection may not match operator intent until P1 override UI — product trade-off, not a security bypass if server-owned. Reference loop video content (who appears in loop) is a **content/QA** concern (US-3.4 / US-10.x), not adapter-enforceable likeness consent. Compromised deploy env still exposes `REPLICATE_API_TOKEN` (shared with SadTalker). V1 allowlist-level disclosure proxy (US-3.4) remains conservative until US-4.x per-slot modality.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `REPLICATE_API_TOKEN` | **Critical** — shared Replicate account | Server adapter modules only (`sadtalker_low` + `musetalk_low`); never persisted or serialized |
| Reference-loop video bytes | **High** — visual likeness in loop | Tenant `avatar_reference` row; server-resolved id; signed M1 URL to Replicate only |
| Voiceover audio bytes | **High** — voice | Same as SadTalker — `voiceoverAssetId` with **`client_id` ownership check** |
| Replicate prediction responses | **Untrusted** | Parsed → US-8.1 normalizers → orchestrator/poller |
| Provider output URLs | **Untrusted** — SSRF vector | **`MUSETALK_ALLOWED_OUTPUT_HOSTS`** (lean: same CDN set as SadTalker); transient until `fetchAsset` |
| `neuramark_video_jobs.portrait_asset_id` (MuseTalk) | Medium — audit FK | Stores loop video asset id; meaning **provider-specific**; not client-writable at INSERT |
| `external_job_id` | Medium | Opaque Replicate prediction id; scoped lookup `(provider_key, client_id)` |
| Stored output MP4 | Medium | Server-generated storage key after download-and-own |
| US-3.4 disclosure obligation | **Highest** — legal class | Enforced downstream QA — adapter does not expose bypass |

**Boundaries:**

1. **Browser → job create (Operator)** — Untrusted. May supply **`voiceoverAssetId`** (ownership-verified). **Must not** supply authoritative **`referenceVideoAssetId`** or **`providerKey`**. No status mutation.
2. **Orchestrator → policy → loop resolver → registry → MuseTalk adapter** — Server resolves loop id, tier, and adapter before Replicate I/O.
3. **Adapter → Replicate API** — Token in header; create/poll to **`https://api.replicate.com`** only; input URLs are signed app-origin M1 links only.
4. **Replicate → M1 provider-assets route** — HMAC + expiry + `client_id` match on asset row; streams Storage bytes.
5. **Adapter / worker → output CDN** — Allowlisted https GET inside `fetchAsset`; stream to Storage.
6. **QA / Script agents (downstream)** — Consume US-3.4 flags; MuseTalk completion does not skip disclosure checks.

---

## Abuse Cases Considered

- *As a malicious actor, I POST `{ referenceVideoAssetId: "<victim-uuid>" }` to create a MuseTalk job* → **Blocked:** orchestrator **does not trust** client loop id; resolves via **`getPrimaryReferenceLoopVideoAssetForClient(sessionClientId)`** or rejects field as forbidden. Even with ownership check, client cannot override earliest-loop policy.
- *As a malicious actor, I pass `video: "https://169.254.169.254/"` in job create* → **Blocked:** adapter accepts **asset ids only**; URLs generated server-side via signed M1 route after MIME + tenancy checks.
- *As a malicious actor, I force MuseTalk when I have only a portrait still* → **Blocked:** policy selects `sadtalker_low` without `hasReferenceLoop`; orchestrator rejects `musetalk_low` without server-resolved loop; MuseTalk adapter rejects portrait-only inputs.
- *As a malicious actor, I force SadTalker while supplying a reference loop id in the body* → **Blocked:** SadTalker adapter rejects `referenceVideoAssetId`; orchestrator SadTalker branch requires portrait still, not loop.
- *As a malicious actor, I create MuseTalk for `own_avatar` to avoid consent* → **Blocked:** orchestrator rejects `musetalk_low` when mode is `own_avatar`; consent gate remains on SadTalker path only.
- *As a malicious actor, I read `REPLICATE_API_TOKEN` from MuseTalk job status* → **Blocked:** same DTO rules as US-8.2/US-8.4 — token never in responses.
- *As a malicious actor, I complete a job whose Replicate output is an internal URL* → **Blocked:** `validateProviderOutputUrl` with frozen allowlist before GET; redirect re-validation.
- *As a malicious actor, I skip US-3.4 disclosure because output used MuseTalk not SadTalker* → **Blocked:** no adapter bypass flag; QA blocking check and agents DTO unchanged; VALIDATION asserts downstream enforcement.
- *As a malicious actor, I poll another client's MuseTalk job* → **Blocked:** US-8.4 IDOR rule — `client_id` scope → **404**.
- *As a malicious actor, I retry with swapped loop id in request body* → **Blocked:** US-8.4 retry loads assets from failed job row + policy re-resolve server-side; forbidden status/cost fields on retry body.
- *As a malicious actor, I import MuseTalk adapter in a Client Component* → **Blocked:** `import "server-only"` on adapter module.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-8.6 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent paths):**

- [ ] **[SEC] All US-8.2 adapter floors** — server-only token, allowlisted output fetch, server-resolved input assets, mandatory normalizers, `rawOutputUrl` non-persistent, poller-only status writes, budget + consent before `createJob`, IDOR-safe poll *(US-8.2)*
- [ ] **[SEC] All US-8.4 orchestration floors** — closed write surface, retry gates, forbidden job authority fields, Operator-only retry *(US-8.4)*
- [ ] **[SEC] `provider_key` chosen by policy engine; client-supplied provider key never accepted** *(US-7.2)*
- [ ] **[SEC] Budget gate runs server-side before vendor I/O** *(US-7.1)*
- [ ] **[SEC] `must_disclose_not_owner` remains server-derived; not client-writable** *(US-3.4)*

**US-8.6 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] Generic-avatar impersonation rules (US-3.4) still apply; MuseTalk does not bypass QA disclosure requirements** *(USER_STORIES US-8.6)*

**Added in this review (binding for US-8.6 BUILD):**

- [ ] **[SEC] (added) Reference-loop asset is server-resolved:** `createTalkingHeadVideoJob` **must not** treat client-supplied `referenceVideoAssetId` as authority. Resolve loop video id via **`getPrimaryReferenceLoopVideoAssetForClient(clientId)`** (CONTRACT-exact query: `asset_type = avatar_reference`, `metadata.detectedMime` ∈ `{ video/mp4, video/quicktime }`, `ORDER BY created_at ASC`, `LIMIT 1`, scoped by `client_id`). Missing loop when policy selected `musetalk_low` → **`NOT_FOUND`** / validation error — fail closed
- [ ] **[SEC] (added) Client loop id forbidden or ignored:** CONTRACT must pick one: **(A)** add `referenceVideoAssetId` to **`FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS`** (preferred — mirror `providerKey` pattern), or **(B)** parse but **always discard** client value and overwrite with server resolver output. Automated test: client sends foreign-owned loop uuid → job uses server-resolved id or rejects — never client id
- [ ] **[SEC] (added) MuseTalk input matrix enforced server-side:** **`musetalk_low` adapter `createJob`** requires **`referenceVideoAssetId` + `voiceoverAssetId`**; **rejects** `portraitAssetId` / `referenceImageAssetId`. **`sadtalker_low`** unchanged — rejects `referenceVideoAssetId`. Orchestrator branches match policy output — no mixed inputs reach adapters
- [ ] **[SEC] (added) Dual-input URL resolution:** reference video and voiceover resolved exclusively through **`resolveMediaAssetUrlForProvider`** (or injectable seam with identical checks) with **`MUSETALK_VIDEO_MIME_ALLOWLIST`** (`video/mp4`, `video/quicktime`) and SadTalker-compatible audio allowlist. **No** `fetch(clientSuppliedUrl)` on job path
- [ ] **[SEC] (added) Video kind on asset resolver:** extend resolver seam with **`kind: "video" | "audio" | "portrait"`** (CONTRACT exact); default impl selects MIME allowlist by kind. M1 signed URL TTL frozen (reuse SadTalker TTL unless CONTRACT documents MuseTalk-specific value)
- [ ] **[SEC] (added) `own_avatar` + MuseTalk rejected:** orchestrator returns **`PROVIDER_UNAVAILABLE`** or **`VALIDATION_ERROR`** if policy/engine path would invoke **`musetalk_low`** while reel `visualMode` or `modalidad` is **`own_avatar`**. MuseTalk jobs are **`generic_avatar` + loop** only
- [ ] **[SEC] (added) Orchestrator provider guard:** after `resolveProviderForJob`, accept **`providerKey ∈ { sadtalker_low, musetalk_low }`** only for talking-head create; remove blanket **`museTalkNotSupported`** reject on `referenceVideoAssetId` **without** opening client loop authority. **`musetalk_low`:** require `script.hasReferenceLoop === true`. **`sadtalker_low`:** require portrait still path unchanged
- [ ] **[SEC] (added) Frozen output host allowlist:** **`MUSETALK_ALLOWED_OUTPUT_HOSTS`** in `lib/contracts/musetalk-low.ts` — minimum same Replicate delivery hosts as SadTalker (`replicate.delivery`, `pbxt.replicate.delivery`, `replicateusercontent.com`) unless SECURITY/catalog migration extends. **`validateProviderOutputUrl` in `getJobStatus` and `fetchAsset`**
- [ ] **[SEC] (added) Download fetch hardening:** `fetchAsset` mirrors SadTalker — max redirects, timeout, Content-Type check (`video/*` / `video/mp4`), max bytes cap; reject non-https schemes
- [ ] **[SEC] (added) Replicate token hygiene (MuseTalk module):** `REPLICATE_API_TOKEN` via catalog `envKeyName` inside **`musetalk-low-adapter.ts` only**; missing → **`PROVIDER_CONFIG_MISSING`** before I/O; never logged or returned; Replicate control plane **`https://api.replicate.com`** only
- [ ] **[SEC] (added) Untrusted response pipeline mandatory:** MuseTalk **`getJobStatus`** uses **`normalizeVideoJobStatusResult(vendor, MUSETALK_ALLOWED_OUTPUT_HOSTS)`**; errors via **`sanitizeProviderErrorMessage`**; prediction id via **`parseExternalJobId`**
- [ ] **[SEC] (added) Job row audit semantics:** MuseTalk INSERT sets **`portrait_asset_id`** = reference-loop **video** asset id (not portrait still); **`voiceover_asset_id`** unchanged. CONTRACT documents provider-specific column meaning. Poller passes **`clientId` + `reelScriptId`** from job row into adapter job context (US-8.4 L1)
- [ ] **[SEC] (added) Lookup binding:** poller loads job with parameterized **`provider_key = 'musetalk_low'`** (from stored row, not client) before **`getVideoAdapter('musetalk_low').getJobStatus`**
- [ ] **[SEC] (added) US-3.4 non-bypass evidence:** adapter and orchestrator expose **no** flag to skip disclosure or QA. VALIDATION.md includes explicit check that MuseTalk job completion does not alter `must_disclose_not_owner` derivation or QA check classification
- [ ] **[SEC] (added) Module boundary:** MuseTalk Replicate HTTP under **`lib/providers/video/musetalk-low-adapter.ts`** with **`import "server-only"`**; grep confirms no duplicate Replicate fetch outside `lib/providers/**`
- [ ] **[SEC] (added) Automated security tests cover at least:** (1) server resolver picks earliest video loop — not client `referenceVideoAssetId`; (2) foreign client loop id in body does not change resolved input; (3) MuseTalk adapter rejects portrait-only input; (4) SadTalker adapter still rejects `referenceVideoAssetId`; (5) `own_avatar` + `musetalk_low` orchestrator branch rejected; (6) mock Replicate error with token → sanitized output contains no `r8_` / `Bearer`; (7) `validateProviderOutputUrl` rejects non-allowlisted host; (8) video MIME rejected for audio kind and vice versa; (9) adapter module imports `server-only`

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Reference-loop resolution — **server authority only** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Resolver | **`getPrimaryReferenceLoopVideoAssetForClient(clientId)`** — server-only; earliest video `avatar_reference` |
| Client field | **`referenceVideoAssetId` on create request is not authority** — prefer **FORBIDDEN** in `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` |
| Policy gate | `musetalk_low` only when `hasReferenceLoop` true (from script context server-loaded) |
| Retry | Reuse loop id from **failed job row** `portrait_asset_id` when `provider_key = musetalk_low`; re-run policy + budget + consent gates (US-8.4) |
| IDOR | Resolver query always **`WHERE client_id = $sessionClientId`** |

**Condition:** CONTRACT documents forbidden-key choice and resolver SQL shape. TASKS open question #4 (operator loop override) is **out of V1** — no client/operator body field to pick alternate loop without a future audited Operator action.

#### 2. Dual-input SSRF — **signed M1 URLs for video + audio** (APPROVE WITH CONDITIONS)

| Layer | Control |
|---|---|
| Video input | `resolveMediaAssetUrlForProvider` + **`MUSETALK_VIDEO_MIME_ALLOWLIST`** |
| Audio input | Same helper + SadTalker audio MIME set |
| M1 route | Existing HMAC verify + expiry + tenant match (US-8.2/US-8.4) |
| Output | **`MUSETALK_ALLOWED_OUTPUT_HOSTS`** + SadTalker-grade download hardening |
| Forbidden | Client absolute URLs; Storage path strings from request; open redirect fetch |

**Condition:** CONTRACT lists exact MIME arrays and reuses or aliases SadTalker fetch limits (`max redirects`, timeout, max bytes).

#### 3. Visual-mode / consent routing — **no MuseTalk on own_avatar** (APPROVE)

| Path | Provider | Consent |
|---|---|---|
| `generic_avatar` + loop | `musetalk_low` | US-3.4 disclosure downstream — **not** US-3.2 likeness consent |
| `own_avatar` / portrait still | `sadtalker_low` | **`assertActiveAvatarConsentForJobs`** before create (unchanged) |
| `generic_avatar` without loop | `sadtalker_low` | Disclosure downstream if allowlist includes generic |

**Condition:** Orchestrator explicit branch — never call MuseTalk adapter for `own_avatar`.

#### 4. US-3.4 disclosure — **adapter is not a bypass channel** (APPROVE)

| Rule | Detail |
|---|---|
| Adapter | No API to clear `must_disclose_not_owner` or skip QA |
| QA | Existing **`generic_avatar_not_owner`** check remains **`blocking`** (US-3.4) |
| VALIDATION | Document downstream enforcement — MuseTalk AC does not require QA implementation in this story |

#### 5. Job row `portrait_asset_id` overload — **document, do not trust blindly** (APPROVE WITH CONDITIONS)

| `provider_key` | `portrait_asset_id` meaning |
|---|---|
| `sadtalker_low` | Portrait still asset id |
| `musetalk_low` | Reference-loop **video** asset id |

**Condition:** CONTRACT + code comments; poller/adapter always use **`provider_key`** from job row when interpreting FK semantics.

#### 6. Registry + token sharing — **same env, separate modules** (APPROVE)

| Rule | Detail |
|---|---|
| Env | Shared **`REPLICATE_API_TOKEN`** per catalog — acceptable |
| Modules | Separate adapter files; each `import "server-only"` |
| Registry | **`createMusetalkLowAdapter`** registered for `musetalk_low`; stub removed |

#### 7. Phase split — **A adapter isolation, B orchestrator unlock** (APPROVE)

| Phase | Security closure |
|---|---|
| A | Adapter + normalizers + mocked SSRF/token tests callable without orchestrator |
| B | Server loop resolver + orchestrator branches + E2E tests with fixture assets |

Both phases required for full USER_STORIES AC; SECURITY AC applies to **both** before VALIDATION sign-off.

---

## Future-Proofing Notes

- **P1 operator loop override:** If added, must be **Operator-only** audited action (US-10.2 pattern) — not a client request field. Budget + consent gates unchanged.
- **US-8.5 / US-8.7:** Copy MuseTalk dual-input and allowlist pattern per vendor; shared normalizers unchanged.
- **US-9.3:** Voiceover id from TTS job row — still **`client_id` ownership check** at orchestrator; MuseTalk does not widen audio authority.
- **US-4.x per-slot modality:** May refine when MuseTalk vs SadTalker is selected; loop resolver may gain slot-scoped variant — must remain server-side.
- **Catalog `capabilities.allowedOutputHosts`:** Prefer catalog mirror of **`MUSETALK_ALLOWED_OUTPUT_HOSTS`** with adapter constant fallback for tests.
- **Real auth (US-14.5):** ownership checks replace interim user — same resolver and IDOR query shapes.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before BUILD starts, verify CONTRACT:

- [ ] `musetalk-low-adapter.ts` path + `server-only`; registry registers real adapter
- [ ] **`MUSETALK_ALLOWED_OUTPUT_HOSTS`** + video/audio MIME allowlists frozen
- [ ] **`getPrimaryReferenceLoopVideoAssetForClient`** SQL + fail-closed behavior
- [ ] Client **`referenceVideoAssetId`** forbidden or documented discard-only
- [ ] Orchestrator branch table: `musetalk_low` vs `sadtalker_low` inputs and guards
- [ ] **`own_avatar` + MuseTalk** explicit reject
- [ ] Asset resolver **`kind`** param + M1 TTL
- [ ] **`portrait_asset_id` semantic overload** on job INSERT for MuseTalk
- [ ] Replicate model version hash + input defaults (`bbox_shift`, `cycle`) frozen
- [ ] Download hardening matches SadTalker CONTRACT limits
- [ ] US-3.4 non-bypass note for VALIDATION
- [ ] Security test matrix (loop authority, dual-input SSRF, own_avatar reject, token redaction)
- [ ] Explicit out-of-scope: operator loop picker UI, US-9.3 TTS body, QA agent implementation

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — **media-pipeline-engineer** (primary) and **nextjs-backend** may author `plan/stories/US-8.6/CONTRACT.md`. Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above. Reconcile with US-8.2/US-8.4 CONTRACT sections — US-8.6 **extends** the adapter matrix and orchestrator branches; does not weaken poller, retry, or poll IDOR rules.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **server-only loop resolution** + client field forbidden/discarded; (2) **dual-input signed URL** path with video MIME allowlist; (3) **`own_avatar` + MuseTalk reject**; (4) **input matrix** per provider key; (5) **`MUSETALK_ALLOWED_OUTPUT_HOSTS`** + download hardening; (6) **token hygiene** + mandatory normalizers; (7) **`portrait_asset_id` overload** documented; (8) **US-3.4 non-bypass** note; (9) security test matrix |
| **REDESIGN** | CONTRACT allows client-authoritative `referenceVideoAssetId`; fetches input from client URL strings; MuseTalk on `own_avatar` without consent path; persists `rawOutputUrl`; skips budget gate; omits video MIME check |
| **VETO (do not BUILD)** | Client Component imports MuseTalk adapter; orchestrator accepts client `providerKey`; open URL fetch for loop video; adapter flag to skip QA/disclosure; retry accepts client-swapped loop id without server row authority |

**Conditions that must be satisfied before BUILD (not optional polish):**

1. **Anti–loop IDOR / client authority:** server resolver owns loop id; client field forbidden or discarded; retry uses job row server-side.
2. **Anti–dual-input SSRF:** video + audio via signed M1 URLs only; output via allowlist + hardened fetch.
3. **Anti–consent/path confusion:** no MuseTalk on `own_avatar`; SadTalker consent gate unchanged.
4. **Anti–disclosure bypass:** no adapter/orchestrator skip of US-3.4 obligation; QA blocking class unchanged downstream.

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any REDESIGN finding blocks BUILD until CONTRACT revision.

---

## CONTRACT freeze list (binding summary)

1. **Loop asset:** server-resolved earliest video `avatar_reference`; client `referenceVideoAssetId` not authority (prefer FORBIDDEN).
2. **Inputs:** MuseTalk = loop video + voiceover; SadTalker = portrait + voiceover; adapters enforce matrix fail-closed.
3. **URLs:** signed M1 HTTPS only for vendor inputs; allowlisted HTTPS only for vendor output download.
4. **Modes:** MuseTalk for `generic_avatar` + loop only; reject `own_avatar` + MuseTalk.
5. **Secrets:** `REPLICATE_API_TOKEN` server-only in MuseTalk adapter module.
6. **Responses:** US-8.1 normalizers on all Replicate JSON; no raw vendor fields persisted.
7. **Jobs:** reuse US-8.4 table; `portrait_asset_id` = loop video id for MuseTalk rows; poller-only status writes.
8. **Gates:** policy → budget → consent (own_avatar only) → `createJob`; retry mirrors US-8.4.
9. **Disclosure:** US-3.4 applies; adapter does not bypass QA blocking class.
10. **Tests:** loop authority, SSRF rejection, own_avatar guard, token redaction, MIME kind separation.

---

## BUILD vetoes (summary)

1. **Client-authoritative `referenceVideoAssetId` on job create (without server resolver overwrite).**
2. **`fetchAsset` or `createJob` using client-supplied absolute URLs for video or audio.**
3. **MuseTalk adapter invoked for `own_avatar` reels.**
4. **Portrait still ids accepted by MuseTalk adapter; loop video id accepted by SadTalker adapter.**
5. **`REPLICATE_API_TOKEN` in Client Component bundle, API response, or job DTO.**
6. **Provider output fetch without `validateProviderOutputUrl` + frozen allowlist.**
7. **Persisting raw Replicate JSON, raw status strings, or `rawOutputUrl` to DB or browser DTO.**
8. **Orchestrator calling `createJob` without preceding budget gate (and consent when SadTalker + own_avatar).**
9. **`getVideoAdapter(` with request-derived `providerKey`.**
10. **Any adapter/orchestrator flag or code path advertised to skip US-3.4 disclosure / QA blocking check.**
11. **Missing security tests for server loop resolution and dual-input MIME rejection.**

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — not REDESIGN because US-8.6 correctly **extends** the proven US-8.2 Replicate adapter pattern and US-8.4 job system rather than inventing parallel I/O or client authority. The incremental risk is **reference-loop video as a second vendor input** plus **orchestrator branching** — both are manageable when loop id resolution is **server-owned**, video MIME checks mirror portrait/audio hardening, and **`own_avatar` cannot reach MuseTalk**. US-3.4 disclosure is a **downstream** obligation; this story must not introduce bypass surfaces.

**Recommended action:** Proceed to **CONTRACT.md** with **media-pipeline-engineer** + **nextjs-backend**; security-architect post-CONTRACT spot-check expected **APPROVE WITH CONDITIONS** when the freeze list is encoded.
