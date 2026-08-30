## Spec Review — US-8.1

### Verdict: GAPS

US-8.1 intent — the **System** exposes a single **Video Provider Adapter** contract (`estimateCost`, `createJob`, `getJobStatus`, `fetchAsset`) plus a **ProviderRegistry** so swapping SadTalker for MuseTalk or HeyGen does not rewrite the assembly pipeline (US-9.x); all jobs share normalized statuses; provider keys stay server-only; vendor responses are treated as untrusted; `external_job_id` stays opaque — is **directionally aligned** with SPEC §3 **Video Provider Adapter** (S3.M9: adapters únicos `estimate/create/status/fetch`; download-and-own; keys server-only; low-tier SadTalker/Wan default), SPEC §5 (`lib/providers/`; tier low default), USER_STORIES § US-8.1, frozen **US-X.4** catalog/`resolveProvider()`/`envKeyName` pattern, frozen **US-7.2** policy engine (`resolveProviderForJob`, boundary `createVideoJobRequestSchema`, forbidden authority keys), and **ADR-0003** (interface + enqueue on Vercel Next server; long poll/download/FFmpeg on Fly worker — adapters callable from both, no FFmpeg in adapter module).

**Gaps** sit between USER_STORIES § US-8.1 acceptance criteria and what must be frozen in **CONTRACT.md** / completed in BUILD: shared **untrusted-response normalization** helpers, explicit **`external_job_id` opaque** persistence rules, **ADR-0003 runtime split** per adapter method, **`fetchAsset` → Storage** contract, **registry bootstrap** module, and **US-8.1-specific tests** (interface + registry + status schema). Partial scaffold exists in `lib/providers/provider-adapters.ts` and `lib/contracts/providers.ts` from US-X.4/US-7.2; USER_STORIES AC remain unchecked. Story intent does not drift from SPEC; unresolved contract shape and missing BUILD artifacts are the blockers.

**Upstream dependencies satisfied or frozen:** **US-7.2** ✅ (`resolveProviderForJob`, `createVideoJobRequestSchema` vs `resolvedCreateVideoJobInputSchema`, `FORBIDDEN_PROVIDER_AUTHORITY_KEYS`, `estimateVideoJobCost` sketch). **US-X.4** ✅ (catalog seed, `getProviderCatalog()`, `resolveProvider()`, `envKeyNameSchema` forbids `NEXT_PUBLIC_*`). **US-7.1** ✅ (budget gate handoff for US-8.2+ createJob re-check).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **Untrusted-response normalization not implemented.** AC [SEC]: status values, URLs, and error messages validated/normalized before persistence; provider error text sanitized before display. Zod schemas exist (`videoJobStatusResultSchema`, `sanitizedErrorMessage`) and `VideoJobStatusResult` documents `rawOutputUrl` as transient, but **no shared server helpers** adapters/pollers must call (e.g. `parseVideoJobStatus(raw)`, `sanitizeProviderError(raw)`, `validateProviderOutputUrl(url, allowedHosts)`). Without frozen helpers, US-8.2/8.4 will diverge. | USER_STORIES US-8.1 [SEC]; SPEC §3 S3.M9 download-and-own; SECURITY_BASELINE § provider boundary hygiene | CONTRACT: add **`lib/providers/normalize-provider-response.ts`** (`import "server-only"`) — map unknown vendor status strings → `videoJobStatusSchema` enum (default `failed` on unknown); strip/limit error text (max 2000, no HTML/script); URL allowlist (https only, host ∈ catalog `capabilities.allowedOutputHosts` or frozen per-adapter constant); **never** persist `rawOutputUrl`. Adapters **must** use helpers before returning `VideoJobStatusResult`. |
| **High** | **`external_job_id` opaque rules not frozen.** AC [SEC]: stored opaque; only sent back to the **same** provider's adapter; never used for local file paths or DB queries beyond exact-match lookup. `createVideoJobResultSchema.externalJobId` is `z.string().min(1)` only — no max length, no charset, no lookup contract, no cross-provider guard. | USER_STORIES US-8.1 [SEC]; SECURITY_BASELINE §4; US-8.2 DB row `external_job_id` | CONTRACT: **`ExternalJobId`** type alias + Zod `externalJobIdSchema` (opaque string, max 512, no path separators); persistence rule — store as-is in `neuramark_video_jobs.external_job_id`; lookups **`WHERE external_job_id = $1 AND provider_key = $2 AND client_id = $3`** only; **`getJobStatus` / `fetchAsset`** receive `(providerKey, externalJobId)` from job row — registry resolves adapter by stored `provider_key`, never client input alone; forbid string interpolation into Storage keys or dynamic SQL. |
| **High** | **ADR-0003 runtime split undocumented for adapter methods.** ADR-0003: Vercel enqueues; Fly worker runs long polls, download, FFmpeg. US-8.1 defines methods but not **which runtime invokes which** — risk of poll/fetch on Vercel (timeout) or secrets duplicated on worker incorrectly. | ADR-0003; SPEC §5 Trabajo largo / FFmpeg; TASKS.md S3.M9 “poll en worker” | CONTRACT: freeze invocation matrix — **Vercel app:** `estimateCost` (policy preview), `createJob` (after budget+consent re-check in US-8.2), job row INSERT; **Fly worker (or server-side poller module shared with worker):** `getJobStatus` loop, `fetchAsset` on terminal success; both import same adapter interface from `lib/providers/`; worker uses service-role Supabase + same env key names. Document in US-8.1 CONTRACT; US-8.4 owns poller wiring. |
| **Medium** | **`fetchAsset` storage contract undefined.** Interface returns `StoredMediaAsset` (`storageKey`, `mimeType`, `sizeBytes`, `actualCostCents`) but no frozen path for download → Supabase Storage → `neuramark_media_assets` INSERT. SPEC requires download-and-own, not long-lived third-party URLs. | SPEC §3 S3.M9; USER_STORIES US-8.2 AC “playable video stored as media_assets”; `storedMediaAssetSchema` | CONTRACT: **`fetchAsset` implementation contract** — server-side HTTP GET of validated URL; stream to Storage under `neuramark/{clientId}/{reelScriptId}/…`; return `storageKey` only; **forbid** persisting provider URL as canonical `output_url` beyond transient poll window; actual cost from vendor billing metadata when present (US-7.3 handoff). US-8.1 ships interface + doc; US-8.2 first adapter implements. |
| **Medium** | **Registry bootstrap missing.** `InMemoryProviderRegistry` exists but no **`getProviderRegistry()`** singleton or server startup registration pattern. US-8.2+ need deterministic adapter lookup by `provider_key` from policy engine. | USER_STORIES US-8.1 BE row; SPEC §5 adapters | CONTRACT: **`lib/providers/registry.ts`** — lazy singleton `InMemoryProviderRegistry`; **`registerDefaultAdapters(registry)`** no-op in US-8.1 BUILD (stubs land US-8.2+); `getVideoAdapterForJob(providerKey)` wraps registry + typed not-found → `PROVIDER_UNAVAILABLE`. Test: unregistered key throws / maps to operator-safe error. |
| **Medium** | **No US-8.1 unit tests.** `lib/providers/providers.test.ts` covers US-X.4 catalog/resolver only — no assertions on `VideoProviderAdapter` shape, `VIDEO_JOB_STATUSES`, registry register/get, or `videoJobStatusResultSchema` rejection of invalid vendor payloads. | USER_STORIES US-8.1 AC; US-7.2 security test matrix pattern | BUILD: add **`provider-adapters.test.ts`** — mock adapter implements four methods; registry round-trip; status enum exhaustiveness; schema rejects non-enum status / overlong error / non-https `rawOutputUrl`; grep `provider-adapters.ts` for `import "server-only"`. |
| **Low** | **Scope bleed in module header (acceptable).** `provider-adapters.ts` also exports `TtsProviderAdapter`, `LlmProviderAdapter`, `resolveProvider`, `estimateVideoJobCost` — from US-X.4/US-7.2, not US-8.1 BE row. Not SPEC drift; US-8.1 AC requires video adapter only. | USER_STORIES US-8.1 owner table; US-X.4 | CONTRACT: US-8.1 BUILD scope = **`VideoProviderAdapter` + registry + video Zod mirrors + normalize helpers**; TTS/LLM interfaces remain upstream — do not remove, document as shared module. |
| **Low** | **`createVideoJobInputSchema` deprecation transition.** US-7.2 CONTRACT defers rename completion to US-8.1 — `@deprecated` re-export exists; BUILD should confirm all Route Handlers use `createVideoJobRequestSchema` only. | US-7.2 CONTRACT L509; `lib/contracts/providers.ts` | CONTRACT/BUILD: grep verify zero client-boundary imports of deprecated schema; optional follow-up: remove deprecated alias after US-8.2 job create lands. |
| **Info** | **Core interface already scaffolded.** `VideoProviderAdapter` four methods, `ProviderRegistry` / `InMemoryProviderRegistry`, shared statuses (`queued` \| `processing` \| `completed` \| `failed` \| `cancelled`), Zod mirrors, `import "server-only"` — match AC literals. | USER_STORIES US-8.1 AC; `lib/providers/provider-adapters.ts`; `lib/contracts/providers.ts` | BUILD completes gaps above; check AC boxes only after tests + CONTRACT freeze. |
| **Info** | **DB correctly out of scope.** US-8.1 DB owner `—`; `neuramark_video_jobs` belongs to US-8.2. No SPEC violation. | USER_STORIES US-8.1; SPEC §3 S3.M9 | Do not add migration in 8.1. |
| **Info** | **Concrete vendors out of scope.** SadTalker (US-8.2), Wan (US-8.5), MuseTalk (US-8.6), HeyGen (US-8.7), manual upload (US-8.3), polling UI (US-8.4) — correctly deferred. | USER_STORIES Sprint 4 split; SPEC §3 | US-8.1 = contract + registry + normalization — not HTTP vendor I/O. |
| **Info** | **Modalidades / playbook / trend untouched.** Adapter interface is vendor-neutral; modalidad routing stays in US-7.2 policy engine — no conflation of Playbook vs Trend. | SPEC §3 Avatar/Visual Mode; CONTEXT **Modalidad de producción** | Adapters consume resolved `providerKey` + asset inputs only. |
| **Info** | **ADRs respected.** Adapter interface on Vercel server layer; no IG publish (ADR-0002); no cron in 8.1 (ADR-0001); long work delegated to worker via ADR-0003 split — not implemented inside adapter module. | ADR-0001–0003; SPEC §5 | Do not run FFmpeg or unbounded poll loops in Vercel Route Handlers. |
| **Info** | **Out of scope held:** Cliente job status UI, Operator retry UI (US-8.4), consent re-check at createJob (US-8.2 [SEC]), budget re-check at createJob (US-8.2), webhooks (US-8.4), RBAC UI, Stories IG, multicanal, ads. | SPEC §1; USER_STORIES phase split | US-8.1 = trust-boundary contract for all US-8.x adapters. |

---

### Terminology violations (CONTEXT)

**None that block** in USER_STORIES § US-8.1 (uses “System”, technical enums for statuses).

Product-facing Operator UI (US-8.4+) and CONTRACT copy must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Job de generación** | generation job |
| **Operator** | admin, administrador, staff |
| **Cliente** | prestador, dueño, usuario final (as product role) |
| **Reel** | piece, content item (generic) |
| **Avatar propio** / **Avatar genérico** / **Sin presencia** | own_avatar / faceless (user-facing ES) |

Technical enums (`queued`, `processing`, `talking_head`, `external_job_id`) are acceptable in code and Operator diagnostics; map to localized labels in FE.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| `normalize-provider-response.ts` (status/error/URL) | **Yes — [SEC] AC** | Shared mandatory path for all adapters and poller. |
| `external_job_id` opaque schema + lookup rules | **Yes — [SEC] AC** | Freeze before US-8.2 migration. |
| ADR-0003 method invocation matrix | **Yes — architecture** | Document Vercel vs Fly per method; US-8.4 implements poller. |
| `fetchAsset` → Storage contract | **Yes — SPEC download-and-own** | Interface doc + first adapter in US-8.2. |
| `getProviderRegistry()` bootstrap | **Yes — AC “new provider = adapter + catalog + env”** | Singleton + registration seam. |
| US-8.1 unit tests | **Yes — BUILD acceptance** | Mock adapter + schema rejection tests. |
| Deprecated boundary schema grep | **No — hygiene** | Confirm US-7.2 transition complete. |
| `neuramark_video_jobs` DDL | **No — US-8.2** | Out of 8.1 scope. |

---

### Recommended action

Proceed to **SECURITY.md** and **CONTRACT.md** with these **non-negotiable freezes**:

1. **`VideoProviderAdapter`** — four methods unchanged; types from `lib/contracts/providers.ts`; `import "server-only"` on adapter modules and normalize helpers.
2. **`normalize-provider-response.ts`** — vendor status → enum; sanitized errors; validated https URLs; no persist `rawOutputUrl`.
3. **`externalJobIdSchema`** + DB lookup rule (exact match + `provider_key` + `client_id`).
4. **ADR-0003 split** — Vercel: estimate + create + enqueue; Fly/shared poller: status + fetchAsset.
5. **`ProviderRegistry`** — `getProviderRegistry()`, `registerDefaultAdapters()` stub; `InMemoryProviderRegistry` retained.
6. **`fetchAsset` contract** — download-and-own to Storage; return `StoredMediaAsset` only.
7. **Tests** — `provider-adapters.test.ts` for registry, statuses, schema hardening.
8. **Explicit out of scope:** vendor HTTP (US-8.2+), `neuramark_video_jobs` (US-8.2), poller/UI (US-8.4), FFmpeg (US-9.x / Fly).

Do not check off USER_STORIES acceptance criteria in this gate.
