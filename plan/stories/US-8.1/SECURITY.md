# Security Design Review — US-8.1

**Story:** US-8.1 — Provider adapter interface  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-8.1 `[SEC]` + AC), `plan/stories/US-X.4/SECURITY.md` (catalog loader + `envKeyName` floor), `plan/stories/US-7.2/SECURITY.md` (policy engine + forbidden client `providerKey`), `plan/stories/US-7.2/CONTRACT.md` (resolved vs request schemas, forbidden fields), `plan/SECURITY_BASELINE.md` (US-8.1–8.7 provider boundary), `lib/providers/provider-adapters.ts`, `lib/contracts/providers.ts`, `lib/providers/resolve-provider-for-job.ts`, `lib/providers/siliconflow-llm-adapter.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementer:** **media-pipeline-engineer** (adapter interface, registry bootstrap, Zod boundary validation, security tests). **nextjs-backend** may co-author CONTRACT.md for schema freezes; no FE scope.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: a **server-only adapter contract** (`VideoProviderAdapter` + TTS/LLM siblings), a **registry** that maps **catalog-seeded `providerKey`** → adapter instance, **Zod-normalized result types** that treat vendor payloads as untrusted, and **no browser-facing provider I/O**. Swapping vendors remains “new adapter class + catalog row + env var” without rewriting assembly (US-9.x).

No REDESIGN. Partial scaffold already exists in `lib/providers/provider-adapters.ts` and `lib/contracts/providers.ts` — conditions below close gaps before BUILD (notably **registry bootstrap discipline**, **adapter lookup authority**, and **response redaction**). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Primary threats modeled:**

| Threat | Abuse class |
|---|---|
| **Registry injection** | Attacker or buggy handler registers a malicious adapter, overwrites a production adapter at runtime, or resolves an adapter for an **unregistered / client-supplied** key — bypassing catalog `active` + tier filters |
| **Adapter bypass** | Orchestrator calls vendor HTTP directly, uses `getCatalogRowByKey(catalog, clientKey)` + `getVideoAdapter(clientKey)`, or pairs `external_job_id` with the **wrong** adapter — skipping policy engine and untrusted-response handling |
| **Secret leakage in adapter responses** | Provider error bodies, redirect URLs, or debug fields containing API keys / `Authorization` headers flow into DB columns, logs, Operator UI, or Cliente status DTOs |

**Inherited floors (US-X.4 / US-7.2 / US-14.5 — do not weaken):** catalog via `getProviderCatalog()` only; **`providerKey` assigned only by `resolveProviderForJob` / policy engine**; forbidden client authority fields on spend paths; `envKeyName` = env var **name** only; RLS deny-by-default; service-role Node only; no `@supabase/supabase-js` in Client Components; interim hardcoded user is sanctioned — not a finding.

**This story owns:** `VideoProviderAdapter` interface + method contracts; `ProviderRegistry` + **`InMemoryProviderRegistry`** (or CONTRACT-exact frozen singleton); **bootstrap module** that registers only known V1 adapters at server init; Zod schemas for adapter **inputs/outputs** in `lib/contracts/providers.ts`; **normalization helpers** for vendor status/URL/error text; **`import "server-only"`** on all adapter/registry modules; security tests for registry immutability after init, lookup authority, response redaction, and `external_job_id` handling.

**This story does not own:** Concrete vendor adapters beyond interface compliance (US-8.2+ SadTalker, Wan, etc.); `video_jobs` DDL/writes (US-8.2); poller/webhook endpoints (US-8.4); budget re-check at submit (US-8.2 `[SEC]`); actual-cost backfill (US-7.3); Operator/provider UI; catalog CRUD.

---

### Threat Summary (US-8.1–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Registry injection (runtime register)** | Malicious or test adapter handles production traffic; exfiltrates inputs to attacker URL | **`registerVideo` / `registerTts` / `registerLlm` callable only from bootstrap module** (`lib/providers/create-provider-registry.ts` or CONTRACT exact). **No** Route Handler / Server Action imports bootstrap mutators. Registry **frozen** after init (`Object.freeze` registry instance or throw on second `register*`). Security test: grep + test that `registerVideo(` appears only in bootstrap (+ tests) |
| **Registry injection (lookup by smuggled key)** | Force `heygen_high` adapter while tier is `low` | **`get*Adapter(providerKey)` receives key only from engine-resolved catalog row** (`resolveProviderForJob` → `row.key`). Lookup **throws** (typed error) when key ∉ registered set. **Never** pass `request`, `formData`, or job row `provider_key` from client-origin paths without engine validation |
| **Adapter bypass (direct vendor HTTP)** | Skip URL validation, sanitization, and audit | **All vendor I/O lives inside adapter classes** implementing the interface. Orchestrators (US-8.x) **must not** `fetch()` provider URLs except via `VideoProviderAdapter.fetchAsset`. Static analysis / grep test for provider hostnames outside `lib/providers/**` |
| **Adapter bypass (`getCatalogRowByKey` shortcut)** | Select inactive/high-tier row by explicit key | **`getCatalogRowByKey` forbidden on untrusted keys** (US-7.2 floor). Adapter path: engine → `resolveProvider` / decision → registry only |
| **Adapter bypass (cross-provider `external_job_id`)** | Poll vendor A with job id from vendor B → wrong data or SSRF | **`external_job_id` is opaque**; persisted with **`provider_key`**; status/fetch methods invoked **only** on the adapter registered for that job’s `provider_key`. Never interpolate into SQL beyond parameterized exact match; **never** into filesystem paths |
| **Secret leakage (raw provider JSON in results)** | API keys in UI/logs/DB | Adapter return types are **closed Zod schemas** — no `rawResponse`, `headers`, `apiKey`, `authorization`. **`rawOutputUrl` is server-transient only** — excluded from persistence schemas and Cliente/Operator status DTOs |
| **Secret leakage (error messages)** | `Bearer sk-…` or vendor stack traces in Operator view | **`sanitizedErrorMessage` only** after redaction helper (strip `Bearer …`, `sk-…`, `api_key=…`, base64 blobs >32 chars). Max length 2000 (existing schema). Raw vendor text **never** persisted or logged at info level |
| **Secret leakage (logs / decision log)** | Margin + credential recon | Log **`providerKey`, `status`, error code** — never log adapter return objects wholesale, env values, or `rawOutputUrl` |
| **Secret leakage (env vars in adapter ctor)** | Key in serialized error | Adapters read `process.env[envKeyName]` inside server module; **`apiKey` fields private**; never included in thrown Error messages or return payloads |
| **Client bundle exposure** | Registry + adapters in browser graph | **`import "server-only"`** on `provider-adapters.ts`, registry bootstrap, and every adapter impl. FE imports **types + Zod from `lib/contracts/providers.ts` only** — not `lib/providers/index.ts` barrel from Client Components |

**Residual risk accepted:** Trusted bootstrap code registers adapters — compromise of deploy artifact remains an ops concern. Provider URLs in `rawOutputUrl` are fetched server-side only (US-8.2 adds host allowlist). Wrong adapter implementation is a code-review risk; interface + tests reduce but do not eliminate it.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Provider API keys (`process.env[envKeyName]`) | **Critical** | Node adapter modules only; never DB, logs, responses |
| **`ProviderRegistry` instance** | **Critical** — controls which code talks to vendors | Singleton; mutated **once** at bootstrap; server-only |
| **`providerKey` → adapter binding** | **Critical** | Key from policy engine output only |
| Vendor HTTP responses (status, URL, error text) | **Untrusted** | Parsed → Zod → normalized types before any persist/log/UI |
| `external_job_id` | Medium — correlation id, not auth | Opaque string; scoped to `(provider_key, external_job_id)` pair |
| `rawOutputUrl` | Medium — SSRF if misused | Transient; server download path only; not stored |
| `sanitizedErrorMessage` | Low–Medium | Operator-facing; redacted |
| `storedMediaAsset` (`storageKey`, costs) | Medium | Our storage layer output — safe for internal persist; no vendor secrets |
| Zod contract types (`lib/contracts/providers.ts`) | Low (types only) | FE-safe share |

**Boundaries:**

1. **Browser → Next.js** — Untrusted. **No** registry access, **no** adapter methods, **no** provider status fields beyond sanitized job DTO (US-8.4).
2. **Job orchestrator (US-8.x) → policy engine → registry → adapter** — Tier/key resolved **before** `getVideoAdapter`. Budget/consent gates (US-7.1, US-3.2) sit **before** `createJob`.
3. **Adapter → vendor API** — Keys in headers server-side; responses treated as hostile input.
4. **Adapter → persistence** — Only Zod-validated, allowlisted fields. **`rawOutputUrl` stops at orchestrator memory** until `fetchAsset` completes.
5. **Bootstrap (module init) → registry** — Trusted code path only; not reachable via HTTP.

---

## Abuse Cases Considered

- *As a malicious actor, I POST a Server Action that calls `registry.registerVideo(myAdapter)`* → **Blocked:** bootstrap-only registration; no HTTP export of mutating registry APIs; frozen after init.
- *As a malicious actor, I pass `providerKey: "heygen_high"` and call `getVideoAdapter` directly* → **Blocked:** US-7.2 forbidden fields on job paths; adapter lookup wired only from engine output (grep/security test).
- *As a malicious actor, I skip the registry and `fetch("https://api.replicate.com/...")` from a Route Handler* → **Veto in BUILD:** vendor hosts only under `lib/providers/**` adapter implementations.
- *As a malicious actor, I store a provider’s raw error `{ "detail": "Invalid Bearer sk-live-..." }` on `video_jobs.failure_reason`* → **Blocked:** persist **`sanitizedErrorMessage`** only; redaction helper applied in adapter or shared normalizer before DB write.
- *As a malicious actor, I persist `rawOutputUrl` and expose it in job status JSON to the browser* → **Blocked:** `rawOutputUrl` omitted from DB schema and Cliente/Operator status DTOs; download server-side via `fetchAsset`.
- *As a malicious actor, I use someone else’s `external_job_id` with our Replicate key to poll their job* → **Out of scope for credential isolation** (vendor-side); **in scope:** our poller only pairs ids with jobs we created and **matching `provider_key`** — foreign ids never looked up without ownership check (US-8.4).
- *As a malicious actor, I inject `../../../etc/passwd` as `external_job_id` into a path builder* → **Blocked:** id is opaque; **no path concatenation**; DB lookup parameterized exact match only (story `[SEC]` AC).
- *As a malicious actor, I import `InMemoryProviderRegistry` in a Client Component* → **Blocked:** `server-only` on provider modules; FE uses contracts types only.
- *As a malicious actor, I register an adapter whose `providerKey` is not in the catalog seed* → **Blocked at bootstrap:** registration validates key ∈ loaded catalog (`getProviderCatalog()`) or ∈ `V1_CATALOG_SEED_KEYS`; unknown keys fail fast at startup (fail closed in prod).

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-8.1 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line.

**Inherited (still binding — do not weaken adjacent paths):**

- [ ] **[SEC] Catalog loaded only via `getProviderCatalog()`** — no direct table SELECT from adapters *(US-X.4)*
- [ ] **[SEC] `provider_key` for a job is chosen by the server-side policy engine; client-supplied provider key is never accepted at job creation** *(US-7.2)*
- [ ] **[SEC] `registry.getVideoAdapter` / TTS / LLM factories receive `providerKey` only from engine output** — not from request body *(US-7.2 added)*
- [ ] **[SEC] Service-role key and provider modules stay server-only** — never Client Components *(US-14.5)*

**US-8.1 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] All adapter code is server-only; provider API keys are read exclusively from server environment variables — never stored in the DB, never in `NEXT_PUBLIC_*` vars, never serialized into any response or log** *(USER_STORIES US-8.1)*
- [ ] **[SEC] The adapter interface treats all provider responses as untrusted input: status values, URLs, and error messages are validated/normalized before persistence, and provider error text is sanitized before display** *(USER_STORIES US-8.1)*
- [ ] **[SEC] `external_job_id` is stored opaque and only ever sent back to the same provider's adapter; it is never used to build local file paths or DB queries beyond an exact-match lookup** *(USER_STORIES US-8.1)*

**Added in this review (binding for US-8.1 BUILD):**

- [ ] **[SEC] (added) Registry bootstrap is the sole mutation site:** `createProviderRegistry()` (CONTRACT exact) loads catalog, reads env keys, registers adapters, returns **frozen** `ProviderRegistry`. **`registerVideo` / `registerTts` / `registerLlm` are not exported** from any module imported by Route Handlers or Server Actions. Second registration attempt throws or no-ops per CONTRACT
- [ ] **[SEC] (added) Bootstrap validates `adapter.providerKey` against catalog:** every registered key must match an **active or inactive** catalog row from `getProviderCatalog()`; adapter `providerKey` must equal `row.key`. Mismatch → startup failure in production
- [ ] **[SEC] (added) Singleton registry access:** orchestrators obtain registry via **`getProviderRegistry()`** (CONTRACT exact) returning the same frozen instance — no per-request `new InMemoryProviderRegistry()` in handlers
- [ ] **[SEC] (added) Adapter lookup authority:** `getVideoAdapter(key)` / `getTtsAdapter` / `getLlmAdapter` called **only** with `key` from `resolveProviderForJob` decision or pre-validated catalog row in server orchestration. Security test / grep: no `getVideoAdapter(` fed from `req`, `input`, `body`, `searchParams`
- [ ] **[SEC] (added) No adapter bypass:** vendor HTTP calls (`fetch`, SDK clients) for LLM/TTS/video providers exist **only** under `lib/providers/**` adapter implementation files. Job pollers and Route Handlers delegate to interface methods
- [ ] **[SEC] (added) Closed adapter result schemas:** `createVideoJobResultSchema`, `videoJobStatusResultSchema`, `storedMediaAssetSchema`, `llmCompletionResultSchema` are the **only** shapes crossing adapter → orchestrator boundary. Forbidden fields in adapter returns: `rawResponse`, `headers`, `apiKey`, `authorization`, `envKeyName`, nested vendor JSON blobs
- [ ] **[SEC] (added) `rawOutputUrl` handling:** set only on in-memory `VideoJobStatusResult`; **validated** with `z.string().url()`; **never** written to `video_jobs`, spend events, or API responses; cleared after successful `fetchAsset`. Document in CONTRACT as **non-persistent**
- [ ] **[SEC] (added) Error sanitization helper** (`sanitizeProviderErrorMessage` or CONTRACT exact): strips Bearer tokens, `sk-` prefixes, query params matching `(api_key|token|secret)=`, collapses whitespace; caps length 2000; returns generic fallback if empty after redaction. **Mandatory** before any `sanitizedErrorMessage` persist or Operator display
- [ ] **[SEC] (added) Status normalization:** vendor status strings mapped through allowlist → `videoJobStatusSchema` enum only. Unknown → `failed` with sanitized message — never pass vendor string through to DB unchecked
- [ ] **[SEC] (added) `external_job_id` constraints:** Zod `z.string().min(1).max(512)` (CONTRACT exact max); charset allowlist `[A-Za-z0-9_\-:.]+` or CONTRACT documented; reject ids containing `/`, `\`, `%2e`, null bytes. Used only as adapter method argument + parameterized DB equality
- [ ] **[SEC] (added) Cross-provider job id binding:** orchestration layer passes `external_job_id` to adapter methods **together with** job row’s server-stored `provider_key`; adapter instance must match that key (registry enforces). Poller (US-8.4) loads both before `getJobStatus`
- [ ] **[SEC] (added) Logging redaction:** adapter/orchestrator logs **must not** include full vendor response bodies, `Authorization` headers, env values, or `rawOutputUrl` at default log level. Structured fields: `providerKey`, `externalJobId` (truncated hash optional), `status`, `errorCode`
- [ ] **[SEC] (added) Module boundaries:** `lib/providers/provider-adapters.ts` retains **`import "server-only"`**. `lib/providers/index.ts` is **not** imported from `"use client"` modules. Types/schemas for FE re-exported from `lib/contracts/providers.ts` only
- [ ] **[SEC] (added) Automated security tests cover at least:** registry `register*` only in bootstrap file (grep); second register throws; `getVideoAdapter("heygen_high")` without registration throws; sanitized error strips `Bearer sk-test`; `rawOutputUrl` absent from persisted job fixture; invalid vendor status maps to `failed`; `external_job_id` with `../` rejected by schema; `provider-adapters.ts` contains `server-only`

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Registry bootstrap — **single init, no runtime injection** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Factory | `createProviderRegistry(): ProviderRegistry` in `lib/providers/create-provider-registry.ts` (CONTRACT exact) |
| Registration | Called once from module side-effect or lazy singleton init on first `getProviderRegistry()` |
| Mutability | After init, registry is **immutable** — overwrite attempts throw `RegistryFrozenError` |
| Export surface | Handlers import **`getProviderRegistry()` only** — not `InMemoryProviderRegistry`, not `register*` |
| Validation | Each adapter’s `providerKey` must exist in catalog snapshot |

**Condition:** CONTRACT documents V1 registered adapters (minimum: existing SiliconFlow LLM stubs; video/TTS may register no-op throws until US-8.2/US-9.3 — but interface + registry must be live).

#### 2. Adapter lookup — **engine output only** (APPROVE)

| Step | Authority |
|---|---|
| Resolve | `resolveProviderForJob` → `{ providerKey, … }` |
| Lookup | `getProviderRegistry().getVideoAdapter(providerKey)` |
| Forbidden | `getVideoAdapter(input.providerKey)` where `input` originated at HTTP boundary |

Reuse US-7.2 **`FORBIDDEN_PROVIDER_AUTHORITY_KEYS`** on all job-create paths; US-8.1 CONTRACT references same list.

#### 3. Untrusted vendor responses — **normalize before trust** (APPROVE WITH CONDITIONS)

| Field | Rule |
|---|---|
| `status` | Map vendor → `videoJobStatusSchema` enum |
| `rawOutputUrl` | Optional URL; **transient**; server fetch only (US-8.2 adds host allowlist) |
| `sanitizedErrorMessage` | Redaction helper output only |
| `progressPercent` | Clamp 0–100; drop if non-finite |

**Condition:** CONTRACT names shared helper path (`lib/providers/normalize-provider-response.ts` or per-adapter with shared sanitizer).

#### 4. Secret hygiene in adapter implementations (APPROVE)

| Rule | Detail |
|---|---|
| Key load | `const apiKey = process.env[row.envKeyName]` inside adapter ctor/factory; missing → throw before network I/O |
| Private fields | `apiKey` never public; never in `JSON.stringify` results |
| Errors | Catch vendor errors → sanitize → rethrow generic **`ProviderAdapterError`** with code, not raw body |
| Return types | Satisfy Zod schemas; no spread of `...vendorJson` into results |

#### 5. `external_job_id` — **opaque correlation id** (APPROVE)

| Use | Allowed |
|---|---|
| Adapter `createJob` return → DB INSERT | Yes, validated string |
| Adapter `getJobStatus` / `fetchAsset` arg | Yes, same provider only |
| Filesystem paths, LIKE queries, dynamic SQL | **Forbidden** |
| Client-visible field | Opaque id ok; no vendor metadata |

#### 6. Interface completeness — **four video methods** (APPROVE)

`VideoProviderAdapter`: `estimateCost`, `createJob`, `getJobStatus`, `fetchAsset` — names frozen per USER_STORIES. TTS/LLM interfaces remain for registry symmetry; video is US-8.1 AC focus.

#### 7. Zod mirrors — **boundary validation** (APPROVE WITH CONDITIONS)

| Schema | Use |
|---|---|
| `resolvedCreateVideoJobInputSchema` | Internal adapter input after engine |
| `createVideoJobResultSchema` | Validate `createJob` return |
| `videoJobStatusResultSchema` | Validate `getJobStatus` return before orchestrator acts |
| `storedMediaAssetSchema` | Validate `fetchAsset` / TTS synthesize return |

**Condition:** CONTRACT adds **`persistedVideoJobStatusSchema`** = `videoJobStatusResultSchema.omit({ rawOutputUrl: true })` for DB/API if needed — explicit non-persistence of URL.

---

## Future-Proofing Notes

- **US-8.2+** concrete adapters implement interface; bootstrap gains registrations; host allowlist lives in `fetchAsset`, not interface.
- **US-8.4** poller uses registry + `(provider_key, external_job_id)`; status writes server-only; Cliente status DTO uses **`persistedVideoJobStatusSchema`** subset.
- **US-7.3** reads `actualCostCents` from `storedMediaAssetSchema` / LLM result — no parallel cost fields on raw vendor payloads.
- **Webhooks (US-8.4):** signature verification is out of US-8.1 scope but webhook handlers **must** call registry with job’s stored `provider_key`, not client-supplied key.
- **Multi-tenancy:** adapters receive `clientId` on inputs for audit; registry remains global — tenant isolation is job row + storage layer, not per-tenant registry.
- **Testing:** stub adapters registered only in test bootstrap — never in production `createProviderRegistry` path.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before BUILD starts, verify CONTRACT:

- [ ] `VideoProviderAdapter` method signatures + `VideoJobStatusResult.rawOutputUrl` semantics (transient, non-persistent)
- [ ] `createProviderRegistry` / `getProviderRegistry` paths, singleton + freeze behavior
- [ ] **`register*` not exported** to handler-importable modules
- [ ] Bootstrap catalog key validation rules
- [ ] Zod schemas: adapter I/O + **`persistedVideoJobStatusSchema`** (no `rawOutputUrl`)
- [ ] `sanitizeProviderErrorMessage` (or equivalent) spec + test vectors (`Bearer sk-…`, `api_key=` query)
- [ ] `external_job_id` max length + charset
- [ ] Forbidden client fields cross-ref US-7.2 `FORBIDDEN_PROVIDER_AUTHORITY_KEYS`
- [ ] **`import "server-only"`** module list frozen
- [ ] Explicit out-of-scope: vendor implementations (US-8.2+), poller routes (US-8.4), `video_jobs` DDL (US-8.2)
- [ ] Security test matrix: registry injection, adapter bypass grep, secret redaction

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — **nextjs-backend** and/or **media-pipeline-engineer** may author `plan/stories/US-8.1/CONTRACT.md`. Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **frozen singleton registry** with bootstrap-only `register*`; (2) adapter lookup **only** from engine-derived `providerKey`; (3) **closed** adapter result schemas with **`rawOutputUrl` non-persistent**; (4) **`sanitizeProviderErrorMessage`** spec; (5) **`external_job_id`** validation + no path/SQL interpolation; (6) **`import "server-only"`** boundaries; (7) vendor HTTP confined to `lib/providers/**`; (8) security test matrix for registry injection, bypass grep, and secret redaction |
| **REDESIGN** | CONTRACT exports mutable registry to handlers; allows client-supplied `providerKey` at adapter lookup; persists `rawOutputUrl` or raw vendor errors; documents direct vendor `fetch` from Route Handlers; omits error sanitization |
| **VETO (do not BUILD)** | Any Route Handler / Server Action calling `registerVideo` / `registerTts` / `registerLlm`; any `getVideoAdapter(requestBody.providerKey)` pattern; any adapter return type including `apiKey`, `headers`, or full vendor JSON persisted to DB; any Client Component import of `lib/providers/index.ts` |

**Conditions that must be satisfied before BUILD (not optional polish):**

1. **Anti–registry-injection:** bootstrap-only registration + frozen singleton + startup catalog key validation.
2. **Anti–adapter-bypass:** engine → registry → adapter chain mandatory; vendor HTTP only in adapter modules.
3. **Anti–secret-leakage:** Zod-closed results, sanitization helper, `rawOutputUrl` transient, logging redaction rules.

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any REDESIGN finding blocks BUILD until CONTRACT revision.

---

## CONTRACT freeze list (binding summary)

1. **Registry:** `createProviderRegistry()` once → frozen `getProviderRegistry()`; no handler-accessible `register*`.
2. **Lookup:** `providerKey` from `resolveProviderForJob` only — never HTTP body.
3. **Responses:** Zod-validated closed shapes; **`rawOutputUrl` never persisted or client-exposed**.
4. **Errors:** `sanitizeProviderErrorMessage` before persist/display — no raw vendor text.
5. **Status:** Vendor strings → `videoJobStatusSchema` enum only.
6. **`external_job_id`:** Opaque, validated, exact-match DB only — no paths, no dynamic SQL.
7. **Secrets:** Env vars server-only; private adapter fields; no keys in logs/responses.
8. **Modules:** `server-only` on registry/adapters; FE types from `lib/contracts/providers.ts`.
9. **Bypass:** Vendor HTTP only under `lib/providers/**`.
10. **Out of scope:** SadTalker/Wan/etc. implementations (US-8.2+), poller/webhooks (US-8.4), job table DDL (US-8.2).

---

## BUILD vetoes (summary)

1. **`registerVideo` / `registerTts` / `registerLlm` imported from Route Handlers, Server Actions, or Client Components.**
2. **Per-request `new InMemoryProviderRegistry()` in production orchestration paths.**
3. **`getVideoAdapter(` / `getTtsAdapter(` / `getLlmAdapter(` fed from request-derived strings.**
4. **Direct vendor API `fetch` outside `lib/providers/**` adapter files.**
5. **Persisting or returning `rawOutputUrl` to browser or DB.**
6. **Persisting raw provider error bodies without sanitization.**
7. **Adapter result types or runtime objects including API keys, auth headers, or `...vendorResponse` spreads.**
8. **Using `external_job_id` in file paths or string-built SQL.**
9. **Missing `import "server-only"` on registry bootstrap or adapter modules.**
10. **Client Component import chain reaching `lib/providers/index.ts`.**

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — not REDESIGN because USER_STORIES already states the correct trust model (server-only adapters, untrusted vendor input, opaque `external_job_id`, env-only keys) and US-7.2 closes **client `providerKey` injection** upstream. US-8.1’s unique risk is the **registry seam**: without bootstrap discipline, an attacker who can mutate the registry or skip it entirely defeats catalog tier enforcement even when job schemas reject forbidden fields. **Conditions** freeze bootstrap authority, lookup chain, and response redaction so **registry injection**, **adapter bypass**, and **secret leakage** are testable failures — not architectural debt passed to US-8.2.

**Recommended action:** Proceed to **CONTRACT.md** with **media-pipeline-engineer** as primary implementer; security-architect post-CONTRACT spot-check expected **APPROVE WITH CONDITIONS** when freeze list is encoded.
