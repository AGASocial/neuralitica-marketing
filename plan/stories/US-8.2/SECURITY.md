# Security Design Review — US-8.2

**Story:** US-8.2 — SadTalker adapter (V1 default talking-head, low tier)  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-8.2 `[SEC]` + AC), `plan/stories/US-8.1/SECURITY.md` + `CONTRACT.md` (adapter contract, normalization, registry), `plan/stories/US-8.1/VALIDATION.md` (stub → real adapter handoff), `plan/stories/US-7.1/SECURITY.md` + `CONTRACT.md` (budget gate), `plan/stories/US-7.2/SECURITY.md` (policy engine, forbidden client `providerKey`), `plan/stories/US-3.2/SECURITY.md` (consent re-check), `plan/stories/US-3.3/SECURITY.md` (portrait asset serving), `plan/stories/US-X.4/SECURITY.md` (`REPLICATE_API_TOKEN`, catalog), `plan/SECURITY_BASELINE.md` §4 (provider boundary hygiene), `docs/adr/0003-worker-flyio-ffmpeg.md`, `lib/providers/normalize-provider-response.ts`, `lib/providers/video/sadtalker-low-stub-adapter.ts`, `supabase/migrations/20260829260000_neuramark_provider_catalog.sql`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementer:** **media-pipeline-engineer** (SadTalker/Replicate adapter, `fetchAsset` download-and-own, job orchestration wiring, security tests). **nextjs-backend** co-authors `CONTRACT.md` for `neuramark_video_jobs` DDL, job-create Route Handler / Server Action, and poller enqueue seam. **nextjs-frontend** owns status polling UI (shared US-8.4) — read-only, IDOR-safe DTOs only.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: the **first real vendor adapter** for `sadtalker_low` (Replicate SadTalker), wired through the **US-8.1 frozen interface**, with **server-only** API key use, **download-and-own** storage, **consent + budget re-check** immediately before submit, and **server-authoritative** job status. This is the highest-risk external trust boundary in Sprint 4 after the abstract US-8.1 contract.

No REDESIGN. The three primary threats — **API key leakage**, **SSRF via provider URLs**, **untrusted vendor responses** — are addressable with concrete acceptance criteria and CONTRACT freezes inherited from US-8.1. Orchestrator may proceed to **CONTRACT.md** after encoding the items below.

**Primary threats modeled:**

| Threat | Abuse class |
|---|---|
| **API key leakage** | `REPLICATE_API_TOKEN` appears in logs, error messages, Cliente/Operator UI, browser bundles, DB columns, or outbound URLs; Replicate error bodies echo the token; adapter throws/errors include raw vendor JSON |
| **SSRF via provider URLs** | Replicate (or a compromised response) returns `output` URL pointing at internal/metadata endpoints (`169.254.169.254`, `localhost`, private RFC1918, arbitrary HTTPS host); server `fetchAsset` follows it without host allowlist |
| **Untrusted vendor responses** | Status strings, progress, prediction ids, error text, or nested JSON from Replicate are persisted or displayed without normalization — enabling stored XSS in Operator UI, path traversal via malformed ids, or job state forgery |

**Inherited floors (US-8.1 / US-7.2 / US-7.1 / US-3.2 / US-X.4 / US-14.5 — do not weaken):** registry lookup from `resolveProviderForJob` output only; `FORBIDDEN_PROVIDER_AUTHORITY_KEYS` on job-create paths; `normalizeProviderJobStatus` / `sanitizeProviderErrorMessage` / `validateProviderOutputUrl` mandatory; `rawOutputUrl` transient and non-persistent; `external_job_id` opaque with parameterized exact-match lookup; vendor HTTP only under `lib/providers/**`; `import "server-only"` on adapter modules; catalog via `getProviderCatalog()`; interim hardcoded user is sanctioned — not a finding.

**This story owns:** Real **`sadtalker_low`** adapter replacing stub; Replicate create/poll/download I/O; frozen **`SADTALKER_ALLOWED_OUTPUT_HOSTS`** (or catalog `capabilities.allowedOutputHosts`); **`neuramark_video_jobs`** migration + server writes; job-create orchestration with **consent + budget gates**; **`fetchAsset`** → Supabase Storage → `neuramark_media_assets` handoff; registry bootstrap swap stub → real adapter; security tests for key redaction, URL allowlist rejection, and response normalization.

**This story does not own:** Full poller loop UI (US-8.4); webhooks (US-8.4); retry/override UX (US-8.4); Wan/MuseTalk/HeyGen adapters (US-8.5–8.7); FFmpeg assembly (US-9.x); TTS synthesize orchestration body (US-9.3 — but job-create **consumes** voiceover asset refs); Cliente-facing cost fields; auth redesign.

---

### Threat Summary (US-8.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **API key leakage (env → client)** | Financial abuse of Replicate account; key harvest from DevTools | `REPLICATE_API_TOKEN` read **only** inside `lib/providers/video/sadtalker-low-adapter.ts` (CONTRACT exact path); **`import "server-only"`**; never `NEXT_PUBLIC_*`; never in Zod response schemas, job DTOs, or `neuramark_video_jobs` columns |
| **API key leakage (logs / errors)** | Token in Vercel/Fly logs or Operator failure panel | Replicate SDK/`fetch` errors → **`sanitizeProviderErrorMessage`** before persist/display; log **`providerKey`, prediction id (truncated), status, error code** only — never full response body or `Authorization` header; security test vector: mock Replicate 401 body containing `Bearer r8_…` |
| **API key leakage (outbound URL)** | Token appended as query param on redirect URL | **`validateProviderOutputUrl`** rejects URLs with `(api_key\|token\|secret)=` in query (sanitizer redacts if echoed in errors); **`fetchAsset`** uses server-held token in **header only**, never embeds key in download URL |
| **SSRF via provider output URL** | Server fetches internal cloud metadata or attacker-controlled host | **`fetchAsset`** calls **`validateProviderOutputUrl(url, SADTALKER_ALLOWED_OUTPUT_HOSTS)`** before any GET; **https only**; host allowlist frozen (see Design Concerns); reject IP-literal hostnames, `localhost`, `.local`, link-local; **no** client-supplied download URL — only adapter-normalized `rawOutputUrl` from poller memory |
| **SSRF via portrait/audio input URLs** | Adapter fetches arbitrary URL if job input smuggles `http://169.254…` | Job inputs reference **`neuramark_media_assets` by server-resolved id** — adapter loads bytes via **Supabase Storage server helper** (ownership-checked), **not** HTTP fetch of user-supplied URL strings. Forbidden: passing through client `sourceUrl` fields |
| **SSRF via Replicate API redirect** | Follow redirects to internal hosts | HTTP client for download: **redirect limit ≤ 3**; re-validate **final** URL host against allowlist after redirects; use pinned fetch wrapper in adapter module |
| **Untrusted status / progress** | UI shows `completed` while vendor failed; infinite poll | **`normalizeProviderJobStatus`** on every Replicate status payload; unknown → **`failed`**; `progressPercent` clamped 0–100; persist **`videoJobStatusSchema` enum only** — never raw Replicate status string |
| **Untrusted error text (XSS / secret echo)** | Operator UI executes HTML; token in `detail` field | Persist **`sanitizedErrorMessage` only** on `neuramark_video_jobs.failure_reason` (CONTRACT column name); React text nodes only in FE; **`sanitizeProviderErrorMessage`** strips HTML-ish patterns via control-char strip + length cap |
| **Untrusted `external_job_id`** | Path traversal or cross-tenant poll | Replicate prediction id validated through **`externalJobIdSchema`** before store/round-trip; lookup **`WHERE external_job_id = $1 AND provider_key = $2 AND client_id = $3`**; never path-concatenate id into Storage keys |
| **Untrusted output URL persisted** | Long-lived third-party URL in DB enables hotlink abuse + SSRF replay | **`rawOutputUrl` never written to `neuramark_video_jobs.output_url`**; canonical output is **`neuramark_media_assets.storage_key`** after `fetchAsset`; job row may hold internal storage reference only |
| **Client sets job status / output** | Forge completion without vendor run | No client-callable mutation of `status` or `output_url`; status updates **poller/worker only** (story `[SEC]`); any status read Route Handler is GET-only with ownership check |
| **IDOR on job status polling** | Client A reads Client B's generation progress | Status endpoint resolves job by id **and** `client_id = getCurrentUser().id`; foreign id → **404** (not 403) |
| **Budget / consent bypass** | Submit talking-head job after revoke or over cap | **`assertReelBudgetAllowsSpend`** + **`hasActiveAvatarConsent`** (when `visualMode === own_avatar`) run **immediately before** `adapter.createJob` in same handler — after policy resolution, before Replicate HTTP |
| **Provider key smuggling** | Force SadTalker spend while policy selected MuseTalk | **`provider_key` on INSERT** = `resolveProviderForJob` output only; adapter from **`getProviderRegistry().getVideoAdapter(decision.providerKey)`** — never request body |

**Residual risk accepted:** Compromise of deploy artifact or Fly worker env still exposes `REPLICATE_API_TOKEN` (ops concern). Replicate account compromise is vendor-side. Poller timing attacks (infer job existence via timing) are low sensitivity — mitigated by 404 uniform messaging where feasible. Full webhook auth is US-8.4; US-8.2 may ship poll-only.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `REPLICATE_API_TOKEN` | **Critical** — direct financial abuse | Server adapter module only; header auth; never persisted or serialized |
| Replicate prediction API responses | **Untrusted** | Parsed → normalize helpers → Zod → orchestrator |
| Provider output URLs (`replicate.delivery`, etc.) | **Untrusted** — SSRF vector | Allowlisted https hosts; transient in memory until `fetchAsset` completes |
| Portrait image + voiceover audio bytes | **High** — likeness / voice | Loaded from **`neuramark_media_assets`** via server ownership check — not client URLs |
| `neuramark_video_jobs` rows | **High** — spend + production state | Service-role writes; `client_id` on every row; status mutations poller-only |
| `external_job_id` (Replicate prediction id) | Medium | Opaque; scoped to `(provider_key, client_id)` |
| `sanitizedErrorMessage` / `failure_reason` | Medium | Operator-facing; redacted |
| Stored MP4 (`neuramark_media_assets`) | Medium | Server-generated storage key; served via ownership-checked route (US-3.3 pattern) |
| Job status polling DTO | Low–Medium | Minimal fields; no `rawOutputUrl`, no vendor JSON, no secrets |

**Boundaries:**

1. **Browser → Next.js** — Untrusted. Polling reads sanitized status only. **No** job status mutation endpoints callable by Client Components.
2. **Job-create handler → policy engine → gates → registry → SadTalker adapter** — Tier/key/consent/budget resolved server-side before Replicate I/O.
3. **Adapter → Replicate API** — Token in `Authorization: Bearer …` server-side; create + status only to **`api.replicate.com`** (CONTRACT freezes base URL).
4. **Adapter / worker → output URL** — Allowlisted https GET only inside `fetchAsset`; stream to Storage.
5. **Adapter → DB** — Normalized status, sanitized errors, opaque ids; **no** provider URLs as canonical output.

---

## Abuse Cases Considered

- *As a malicious actor, I read `REPLICATE_API_TOKEN` from a job status API response* → **Blocked:** token never in DTOs; closed schemas; grep test on handler serializers.
- *As a malicious actor, I trigger SSRF by completing a job whose Replicate output is `https://169.254.169.254/latest/meta-data/`* → **Blocked:** `validateProviderOutputUrl` rejects non-allowlisted host before GET; IP-literal hosts rejected.
- *As a malicious actor, I pass `outputUrl: "https://evil.com/shell.mp4"` in a client payload* → **Blocked:** clients do not supply output URLs; poller reads URL only from adapter-normalized `getJobStatus` result in server memory.
- *As a malicious actor, I persist Replicate's raw error `{"detail":"Invalid token r8_abc…"}` to the job row* → **Blocked:** `sanitizeProviderErrorMessage` before INSERT/UPDATE of failure text.
- *As a malicious actor, I POST to an endpoint setting `video_jobs.status = completed`* → **Blocked:** no such handler; poller/worker module exclusive writer (story `[SEC]`).
- *As a malicious actor, I poll job status for another client's `jobId`* → **Blocked:** query scoped by `client_id`; foreign → **404**.
- *As a malicious actor, I create a talking-head job after revoking avatar consent* → **Blocked:** live `hasActiveAvatarConsent` immediately before `createJob` when mode is `own_avatar`.
- *As a malicious actor, I create a job that exceeds Reel budget* → **Blocked:** `assertReelBudgetAllowsSpend` immediately before `createJob`; estimate from server `estimateCost` / policy engine.
- *As a malicious actor, I supply `providerKey: "heygen_high"` on job create* → **Blocked:** US-7.2 forbidden fields; engine resolves `sadtalker_low` when policy selects low-tier talking-head.
- *As a malicious actor, I use a crafted `external_job_id` to read `/etc/passwd` via Storage key* → **Blocked:** `externalJobIdSchema` rejects path chars; storage keys server-generated UUID paths — never derived from prediction id.
- *As a malicious actor, I import the SadTalker adapter in a Client Component* → **Blocked:** `server-only` on adapter module; FE consumes job status via Route Handler DTO only.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-8.2 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent paths):**

- [ ] **[SEC] All US-8.1 adapter floors** — registry bootstrap authority, closed result schemas, `rawOutputUrl` non-persistent, `external_job_id` opaque rules, vendor HTTP only under `lib/providers/**`, `server-only` modules *(US-8.1)*
- [ ] **[SEC] `provider_key` chosen by policy engine; client-supplied provider key never accepted** *(US-7.2)*
- [ ] **[SEC] Budget gate runs server-side before vendor I/O** *(US-7.1 — US-8.2 is first video call site)*
- [ ] **[SEC] Active avatar consent re-checked at job time for `own_avatar`** *(US-3.2)*

**US-8.2 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] Job creation re-verifies active avatar consent (US-3.2) when mode is `own_avatar`, and budget (US-7.1) server-side immediately before submit** *(USER_STORIES US-8.2)*
- [ ] **[SEC] Job status is updated only by the server-side poller; no client-callable endpoint can set status or `output_url`** *(USER_STORIES US-8.2)*
- [ ] **[SEC] Output video is downloaded server-side; provider URLs are validated (https, expected host) before fetch** *(USER_STORIES US-8.2)*
- [ ] **[SEC] Status polling from the browser is scoped to jobs owned by the current client; foreign job IDs return 404** *(USER_STORIES US-8.2)*

**Added in this review (binding for US-8.2 BUILD):**

- [ ] **[SEC] (added) Replicate API token hygiene:** `REPLICATE_API_TOKEN` loaded from `process.env.REPLICATE_API_TOKEN` (catalog `envKeyName`) inside adapter only; missing → throw **`ProviderAdapterError`** before network I/O; never logged, never in thrown `Error.message` verbatim from vendor, never in API responses
- [ ] **[SEC] (added) Replicate HTTP surface confined:** outbound Replicate control-plane calls target **`https://api.replicate.com`** only (predictions create/get — CONTRACT freezes paths); **no** generic “proxy URL” helper accepting caller-supplied base URL
- [ ] **[SEC] (added) Frozen output host allowlist:** `SADTALKER_ALLOWED_OUTPUT_HOSTS` (CONTRACT exact) minimum: `replicate.delivery`, `pbxt.replicate.delivery`, `replicateusercontent.com` — extend only via catalog migration + security review; **`validateProviderOutputUrl` invoked in `getJobStatus` and again in `fetchAsset`** before GET
- [ ] **[SEC] (added) Download fetch hardening:** `fetchAsset` uses server-side fetch with **max redirects 3**, **timeout** (CONTRACT exact, e.g. 120s), **Content-Type** check (`video/*` or allowlist `video/mp4`); max download bytes cap (CONTRACT exact, e.g. 100MB) — abort over limit; reject `file://` and non-https schemes
- [ ] **[SEC] (added) Input asset resolution:** portrait and audio inputs resolved by **`media_asset_id`** server-side with **`client_id` ownership check**; adapter receives **Storage paths or signed server URLs generated internally** — never client-supplied absolute URLs
- [ ] **[SEC] (added) Untrusted response pipeline mandatory:** SadTalker adapter **`getJobStatus`** pipes Replicate JSON through **`normalizeVideoJobStatusResult(vendor, SADTALKER_ALLOWED_OUTPUT_HOSTS)`** before return; **`createJob`** validates prediction id via **`parseExternalJobId`**; **`createJob` return** via **`parseCreateVideoJobResult`**
- [ ] **[SEC] (added) Persistence shape:** `neuramark_video_jobs.failure_reason` stores **`sanitizedErrorMessage` only**; **`output_url` column** stores **internal storage reference or null** — **not** Replicate delivery URL; provider URL exists only in poller process memory between `getJobStatus` and `fetchAsset`
- [ ] **[SEC] (added) Job row tenancy:** every `neuramark_video_jobs` row includes **`client_id NOT NULL`**; all reads/writes filter by server-resolved client (or service-role poller loads row then verifies tenant before adapter call)
- [ ] **[SEC] (added) Lookup binding:** poller/worker loads job with **`WHERE id = $1 AND provider_key = 'sadtalker_low' AND client_id = $2`** (parameterized); passes prediction id to **`getVideoAdapter('sadtalker_low').getJobStatus`** only — never adapter selected from client input
- [ ] **[SEC] (added) Status poll DTO:** browser-facing job status response uses **`persistedVideoJobStatusSchema`** subset — excludes `rawOutputUrl`, vendor JSON, tokens; includes `status`, optional `progressPercent`, optional sanitized `failureReason`
- [ ] **[SEC] (added) Registry swap:** production bootstrap registers **`createSadtalkerLowAdapter()`** (real) instead of stub; stub remains in tests only; grep confirms **`replicate.com`** appears only under `lib/providers/**`
- [ ] **[SEC] (added) Automated security tests cover at least:** (1) mock Replicate error with token → sanitized output contains no `r8_` / `Bearer`; (2) `validateProviderOutputUrl('https://evil.com/x', allowlist)` throws; (3) metadata IP URL rejected; (4) `externalJobIdSchema` rejects `../` and slashes; (5) job status handler returns **404** for peer client's job id; (6) no `REPLICATE_API_TOKEN` in serialized status DTO fixture; (7) adapter module imports `server-only`

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. API key handling — **server-only, never crosses trust boundary** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Env var | **`REPLICATE_API_TOKEN`** — matches catalog row `sadtalker_low.env_key_name` |
| Load site | Adapter factory/ctor in `lib/providers/video/sadtalker-low-adapter.ts` only |
| Transport | `Authorization: Bearer ${token}` header on Replicate API calls only |
| Missing key | Throw before create/poll — fail closed; job create surfaces operator-safe error |
| Forbidden | Logging token; including in `sanitizedErrorMessage`; returning in any DTO; `NEXT_PUBLIC_` prefix; storing in `neuramark_video_jobs` |

**Condition:** CONTRACT documents redaction test vectors and forbids Replicate SDK debug logging in production.

#### 2. SSRF prevention — **allowlisted download, server-resolved inputs** (APPROVE WITH CONDITIONS)

| Layer | Control |
|---|---|
| Output URL | **`SADTALKER_ALLOWED_OUTPUT_HOSTS`** frozen constant + catalog `capabilities.allowedOutputHosts` mirror |
| Validation | **`validateProviderOutputUrl`** before assigning `rawOutputUrl` and before `fetchAsset` GET |
| Input media | Resolve **`neuramark_media_assets`** by id + `client_id`; read via Storage API — **no** open URL fetch from job payload |
| Redirects | Re-validate host after redirect chain; cap redirects |
| Egress | Replicate control plane host separate from delivery CDN hosts — both allowlisted independently |

**Condition:** CONTRACT lists exact host array and rejects IP-literal / localhost hostnames in `validateProviderOutputUrl` implementation (extend US-8.1 helper if needed — prefer shared helper enhancement over adapter-one-off).

#### 3. Untrusted vendor responses — **normalize before persist or display** (APPROVE)

| Replicate field | Handling |
|---|---|
| `status` | **`normalizeProviderJobStatus`** |
| `error` / `logs` | **`sanitizeProviderErrorMessage`** — logs field never persisted raw |
| `output` URL(s) | First https URL string → **`validateProviderOutputUrl`** → transient `rawOutputUrl` |
| `id` (prediction) | **`externalJobIdSchema`** → store as `external_job_id` |
| Unknown/extra JSON | **Dropped** — never spread into DB or DTO |

#### 4. Job create orchestration — **gates before Replicate** (APPROVE)

| Step | Order |
|---|---|
| 1 | `getCurrentUser()` / `requireActive` |
| 2 | Load reel script + visual mode server-side |
| 3 | `resolveProviderForJob` → expect `sadtalker_low` when policy selects low talking-head |
| 4 | `adapter.estimateCost` + **`assertReelBudgetAllowsSpend`** |
| 5 | If `own_avatar`: **`hasActiveAvatarConsent`** — fail closed |
| 6 | Resolve portrait + voiceover asset ids with ownership |
| 7 | **`adapter.createJob`** → INSERT `neuramark_video_jobs` + **`recordReelSpendEvent`** (estimated) |
| 8 | Enqueue poller/worker (ADR-0003) — no long poll on Vercel |

#### 5. `neuramark_video_jobs` DDL — **tenant-scoped, no long-lived provider URL** (APPROVE WITH CONDITIONS)

| Column | Rule |
|---|---|
| `client_id` | **NOT NULL**, indexed |
| `provider_key` | Server-written; must match engine decision |
| `external_job_id` | Opaque; **`externalJobIdSchema`** |
| `status` | **`videoJobStatusSchema`** enum only |
| `failure_reason` | Sanitized text only; nullable |
| `output_url` | Internal storage path or FK to `media_assets` — **not** Replicate CDN URL |
| `provider_tier` | From policy at create time |

**Condition:** RLS enabled deny-by-default; service-role access from Node only (match US-X.4 pattern).

#### 6. Runtime split (ADR-0003) — **create on Vercel, poll/fetch on worker** (APPROVE)

| Method | Runtime |
|---|---|
| `estimateCost` | Vercel (preview / gate) |
| `createJob` | Vercel (after gates) |
| `getJobStatus` loop | Fly worker / shared poller module |
| `fetchAsset` | Fly worker on terminal success |

Worker uses same env var names and adapter code paths — no duplicate secret storage pattern.

#### 7. Status polling endpoint — **read-only, IDOR-safe** (APPROVE)

| Rule | Detail |
|---|---|
| Auth | Session required |
| Scope | `job.client_id === currentUser.clientId` |
| Foreign id | **404** |
| Writable fields | **None** via this endpoint |
| Response | `persistedVideoJobStatusSchema` + job id + timestamps — no secrets |

---

## Future-Proofing Notes

- **US-8.4** owns retry limits, stale timeout, webhook signature verification — SadTalker adapter must not embed retry policy that skips budget re-check on retry create.
- **US-8.5 / US-8.6 / US-8.7** copy this adapter's security pattern: per-vendor allowlist, same normalization pipeline, no shared "fetch any URL" utility.
- **US-7.3** backfills **`actual_cost_cents`** from `storedMediaAsset.actualCostCents` after `fetchAsset` — Replicate billing metadata treated as untrusted number (validate finite non-negative int).
- **Multi-tenancy:** `client_id` on job rows enables future RLS without adapter rewrite.
- **Real auth (US-14.5):** ownership checks replace interim hardcoded user — same query shape.
- **Catalog drift:** prefer **`capabilities.allowedOutputHosts`** on catalog row with migration to update hosts — constant fallback in adapter for bootstrap/tests.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before BUILD starts, verify CONTRACT:

- [ ] SadTalker adapter module path + `server-only`; stub replacement in `createProviderRegistry`
- [ ] **`REPLICATE_API_TOKEN`** handling spec + missing-key behavior
- [ ] **`SADTALKER_ALLOWED_OUTPUT_HOSTS`** frozen list + `validateProviderOutputUrl` call sites (`getJobStatus`, `fetchAsset`)
- [ ] Download hardening: timeout, max bytes, redirect cap, Content-Type check
- [ ] Input resolution via `media_asset_id` + ownership — no client URLs
- [ ] **`normalizeVideoJobStatusResult`** mandatory path for Replicate payloads
- [ ] Job-create handler step order: policy → budget → consent → createJob
- [ ] **`neuramark_video_jobs` DDL** with `client_id`, sanitized failure, no provider URL persistence
- [ ] **`FORBIDDEN_PROVIDER_AUTHORITY_KEYS`** on job-create request schema
- [ ] ADR-0003 invocation matrix for SadTalker methods
- [ ] Status poll Route Handler read-only + 404 IDOR rule + DTO omits `rawOutputUrl`
- [ ] **`recordReelSpendEvent`** + **`assertReelBudgetAllowsSpend`** call sites
- [ ] Security test matrix (token redaction, SSRF URL rejection, IDOR 404, grep replicate.com)
- [ ] Explicit out-of-scope: US-8.4 retry UI/webhooks, other vendor adapters

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — **media-pipeline-engineer** (primary) and **nextjs-backend** may author `plan/stories/US-8.2/CONTRACT.md`. Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **`REPLICATE_API_TOKEN` server-only** spec with redaction tests; (2) frozen **`SADTALKER_ALLOWED_OUTPUT_HOSTS`** + **`validateProviderOutputUrl`** at both status and fetch; (3) **input assets via Storage ownership**, not client URLs; (4) **mandatory normalization pipeline** for all Replicate JSON; (5) **job-create gate order** (policy → budget → consent → create); (6) **`neuramark_video_jobs` DDL** without long-lived provider URLs; (7) **poller-only status writes** + read-only IDOR-safe poll API; (8) ADR-0003 runtime matrix; (9) security test matrix for the three primary threats |
| **REDESIGN** | CONTRACT allows client-supplied output/download URL; persists `rawOutputUrl` or Replicate CDN URL as canonical `output_url`; fetches portrait/audio from request URL strings; omits allowlist; skips consent or budget gate before `createJob`; exposes token or vendor raw JSON in DTOs |
| **VETO (do not BUILD)** | Any Client Component importing SadTalker adapter; any handler accepting client `providerKey` / `status` / `outputUrl`; any `fetch(userSuppliedUrl)` in job path without allowlist; any log line printing Replicate response bodies at info level in production path |

**Conditions that must be satisfied before BUILD (not optional polish):**

1. **Anti–API-key-leakage:** env-only token, sanitization, closed DTOs, no token in logs/errors/responses.
2. **Anti–SSRF:** allowlisted https output hosts, server-resolved input assets, redirect re-validation, no client URL authority.
3. **Anti–untrusted-response:** normalization helpers on every Replicate payload before persist/display; opaque validated prediction ids; enum status only.

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any REDESIGN finding blocks BUILD until CONTRACT revision.

---

## CONTRACT freeze list (binding summary)

1. **Secrets:** `REPLICATE_API_TOKEN` server-only in SadTalker adapter; never in DB/DTOs/logs.
2. **SSRF:** `SADTALKER_ALLOWED_OUTPUT_HOSTS` + `validateProviderOutputUrl` before any provider URL fetch; inputs from Storage only.
3. **Responses:** `normalizeVideoJobStatusResult` + `sanitizeProviderErrorMessage` on all Replicate JSON; no raw vendor fields persisted.
4. **Jobs:** `neuramark_video_jobs` tenant-scoped; poller-only status mutation; no provider CDN URL as canonical output.
5. **Gates:** budget + consent immediately before `createJob`; policy engine owns `provider_key`.
6. **Lookup:** `(client_id, provider_key, external_job_id)` parameterized exact match.
7. **Runtime:** create on Vercel; poll + `fetchAsset` on worker (ADR-0003).
8. **Polling API:** read-only; foreign job → 404; `persistedVideoJobStatusSchema` only.
9. **Module boundary:** Replicate HTTP under `lib/providers/video/` only; `server-only`.
10. **Out of scope:** US-8.4 retry/webhook UI, other adapters, FFmpeg.

---

## BUILD vetoes (summary)

1. **`REPLICATE_API_TOKEN` (or any env provider key) in Client Component bundle, API response, or `neuramark_video_jobs` column.**
2. **`fetchAsset` or `getJobStatus` fetching a URL not passing `validateProviderOutputUrl` with frozen allowlist.**
3. **Portrait/audio loaded from client-supplied HTTP(S) URL without Storage ownership check.**
4. **Persisting raw Replicate status strings, raw error JSON, or `rawOutputUrl` to DB or browser DTO.**
5. **Client-callable endpoint mutating `video_jobs.status` or `output_url`.**
6. **Job create path calling `createJob` without preceding `assertReelBudgetAllowsSpend` and (when `own_avatar`) `hasActiveAvatarConsent`.**
7. **`getVideoAdapter(` with request-derived `providerKey`.**
8. **Using `external_job_id` in Storage key paths or dynamic SQL beyond parameterized equality.**
9. **Direct `fetch('https://api.replicate.com/…')` outside `lib/providers/**` SadTalker adapter module.**
10. **Missing security tests for token redaction, SSRF rejection, and IDOR 404 on status poll.**

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — not REDESIGN because USER_STORIES and US-8.1 already mandate the correct trust model (server-only keys, download-and-own, untrusted vendor input, server poller authority), and US-8.2 is the intended first concrete implementation. The story's unique risk is **executing** that model against a real vendor: Replicate responses carry **download URLs** (SSRF), **error bodies** that echo credentials (leakage), and **arbitrary JSON** (trust boundary). **Conditions** freeze allowlists, gate ordering, and persistence shapes so the three primary threats are **testable BUILD failures**, not documentation debt for US-8.4/US-8.5.

**Recommended action:** Proceed to **CONTRACT.md** with **media-pipeline-engineer** as primary implementer; **nextjs-backend** owns DDL + job-create handler contract; security-architect post-CONTRACT spot-check expected **APPROVE WITH CONDITIONS** when the freeze list is encoded.
