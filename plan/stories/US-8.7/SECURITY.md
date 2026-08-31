# Security Design Review — US-8.7

**Story:** US-8.7 — HeyGen adapter (high tier / operator fallback, P1)  
**Date:** 2026-08-31  
**Reviewer:** security-architect  
**Sources:** `plan/stories/US-8.7/README.md`, `plan/stories/US-8.7/TASKS.md`, `plan/USER_STORIES.md` (US-8.7 AC), `plan/SECURITY_BASELINE.md` § Video Provider, `plan/stories/US-8.2/SECURITY.md` (SadTalker pattern — consent / budget / download-and-own), `plan/stories/US-8.6/SECURITY.md` (orchestrator allowlist extension), `plan/stories/US-8.4/SECURITY.md` (`requireOperator`, retry override audit), `plan/stories/US-8.1/SECURITY.md` (adapter boundary, normalizers), `plan/stories/US-7.2/SECURITY.md` (tier floor, forbidden client `providerKey`), `plan/stories/US-7.1/SECURITY.md` (budget gate), `plan/stories/US-3.2/SECURITY.md` (consent), `plan/stories/US-X.4/SECURITY.md` (`heygen_high` catalog, `HEYGEN_API_KEY`)  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementer:** **media-pipeline-engineer** (HeyGen adapter, `fetchAsset`, mocked-HTTP tests). **nextjs-backend** co-authors `CONTRACT.md` for orchestrator Phase B, operator fallback action, catalog activate migration. **nextjs-frontend** — Operator “Generate with HeyGen” action (EN/ES); presentation only.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: a **real HeyGen `VideoProviderAdapter`** for catalog key **`heygen_high`**, replacing the US-8.1 stub, with **server-only `HEYGEN_API_KEY`**, **download-and-own** storage, **US-8.2 gate order** (policy → estimate → budget → consent → create), **never silent default when `provider_tier = low`**, and **operator-only fallback** after low-tier failure — **never** client-supplied `provider_key`. Phase B correctly activates the catalog row for high-tier policy select without changing low-tier routing.

No REDESIGN / VETO. The six primary HeyGen-specific threats — **API key leakage**, **silent high-tier / Avatar IV cost footgun**, **operator-fallback abuse**, **SSRF via HeyGen CDN / input URLs**, **untrusted vendor JSON**, **client `provider_key` smuggling** — are addressable with concrete acceptance criteria inherited from US-8.2/8.4/8.6 and extended below. Orchestrator may proceed to **CONTRACT.md** after encoding the items below.

**Condition count:** **12** binding conditions (must land in CONTRACT + BUILD; see § Conditions before BUILD).

**Primary threats modeled:**

| Threat | Abuse class |
|---|---|
| **`HEYGEN_API_KEY` leakage** | Key in Client Component bundle, job DTOs, logs, error messages, catalog rows, or query strings; HeyGen error bodies echo the key |
| **Silent high-tier / Avatar IV cost footgun** | Low-tier policy resolves `heygen_high`; auto-fallback after SadTalker/MuseTalk failure; omit `engine` so HeyGen defaults to Avatar IV (higher spend) |
| **Operator-fallback abuse** | Cliente invokes “Generate with HeyGen”; eligibility without failed low-tier parent; skip budget/consent; forge override without audit |
| **SSRF via HeyGen URLs** | Compromised status returns internal/metadata URL; adapter fetches client-supplied portrait/audio HTTPS strings |
| **Untrusted HeyGen responses** | Raw status/error/JSON persisted or rendered → XSS, state forgery, opaque id path traversal |
| **Client `provider_key` / tier smuggling** | Body forces `heygen_high` or `tier: high` while policy is `low` |

**Inherited floors (US-8.1 / US-8.2 / US-8.4 / US-8.6 / US-7.2 / US-7.1 / US-3.2 / US-X.4 / US-14.5 — do not weaken):** registry lookup from `resolveProviderForJob` (or audited operator-fallback force) only; `FORBIDDEN_PROVIDER_AUTHORITY_KEYS` / `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` on create paths; `normalizeVideoJobStatusResult` / `sanitizeProviderErrorMessage` / `validateProviderOutputUrl` mandatory; `rawOutputUrl` transient and non-persistent; poller-only status writes; budget + consent immediately before `createJob`; IDOR-safe poll → 404; vendor HTTP only under `lib/providers/**`; `requireOperator` on operator mutations; interim hardcoded user is sanctioned — not a finding.

**This story owns:** Real **`heygen_high`** adapter; `lib/contracts/heygen-high.ts` (env key, API base, **explicit non–Avatar-IV engine**, MIME allowlists, **HeyGen output hosts**); registry stub → real swap; `estimateCost` from catalog `per_second`; Phase B catalog **activate** + cost_model correction; orchestrator allowlist extend; **operator fallback Server Action** + override audit; Operator FE action (EN/ES); security tests for key redaction, tier floor, fallback gate, engine-not-omitted, SSRF rejection.

**This story does not own:** New `video_jobs` DDL / poller (US-8.4); Wan / LTX / ElevenLabs adapters; Avatar IV / V catalog or UI; HeyGen webhook callback endpoint (poll-only V1); per-client HeyGen avatar marketplace UI; FFmpeg assembly (US-9.x); silent auto-upgrade product path.

---

### Threat Summary (US-8.7–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **`HEYGEN_API_KEY` leakage (env → client)** | Financial abuse of HeyGen account | Key read **only** inside `lib/providers/video/heygen-high-adapter.ts` via catalog `envKeyName`; **`import "server-only"`**; never `NEXT_PUBLIC_*`; never in Zod response schemas, job DTOs, or DB columns |
| **`HEYGEN_API_KEY` leakage (logs / errors)** | Key in Vercel/Fly logs or Operator failure panel | HeyGen errors → **`sanitizeProviderErrorMessage`** before persist/display; log **`providerKey`, truncated external id, status, error code** only — never full response body or `X-Api-Key` header |
| **Silent default on `provider_tier = low`** | Uncontrolled high spend; margin breach | **US-7.2 tier floor unchanged:** `resolveProviderForJob` **never** returns `heygen_high` when effective tier is `low`, even after Phase B `active = true`. Automated test required |
| **Silent upgrade after low-tier failure** | Same as above without operator intent | **No auto-fallback.** Only explicit Operator action after **failed** low-tier talking-head job (`sadtalker_low` \| `musetalk_low`). Low-tier **retry** stays on low provider — never silently becomes HeyGen |
| **Avatar IV auto-select (cost footgun)** | Higher vendor price than AC ~$1/min standard | Every `createJob` POST **must set explicit `engine` ≠ Avatar IV** (CONTRACT freezes string). **Never omit** `engine` (HeyGen API defaults to Avatar IV). No V1 UI/catalog for Avatar IV/V. Test asserts engine present and not IV |
| **Operator fallback without `requireOperator`** | Cliente burns high-tier budget | Fallback Server Action / Route Handler: **`requireOperator("handler")` first** → **403** for Cliente. FE hide is non-authoritative |
| **Fallback eligibility forge** | Force HeyGen without failed parent | Server loads latest talking-head job for reel; eligibility = **`status = failed`** and **`provider_key ∈ { sadtalker_low, musetalk_low }`** (CONTRACT may also allow max-retries exhausted). Client cannot supply parent id that skips this check without ownership + eligibility verify |
| **Fallback skips budget / consent** | Spend / likeness without gates | Same gate order as US-8.2/8.4: (fallback force or policy) → estimate → **`assertReelBudgetAllowsSpend`** → **`assertActiveAvatarConsentForJobs`** when `own_avatar` → `adapter.createJob` → INSERT → spend → poll |
| **Client `provider_key` / tier / Avatar IV flags** | Force expensive path | Reject with **`FORBIDDEN_FIELDS`**: `providerKey`, `provider_key`, `tier`, `providerTier`, `engine`, `avatarIv`, `heygenEngine`, cost drivers. Fallback **forces `heygen_high` server-side** — never from body |
| **SSRF via HeyGen output URL** | Server fetches internal/metadata hosts | **`HEYGEN_ALLOWED_OUTPUT_HOSTS`** (CONTRACT — **do not reuse Replicate hosts**); **`validateProviderOutputUrl`** in `getJobStatus` and `fetchAsset`; https only; redirect re-validate; timeout + max bytes |
| **SSRF via input URLs to HeyGen** | Adapter posts attacker URL as `image_url` / `audio_url` | Inputs from **`neuramark_media_assets`** via ownership-checked **`resolveMediaAssetUrlForProvider`** (signed M1) or CONTRACT-frozen studio **`avatar_id` from server env** — **never** client absolute URLs |
| **Untrusted HeyGen JSON** | XSS / state forgery / bad ids | Mandatory US-8.1 normalizers; enum status only; sanitized failure only; **`externalJobIdSchema`**; drop unknown fields |
| **Long-lived HeyGen CDN as canonical** | Hotlink abuse + SSRF replay | **`fetchAsset`** download-and-own → Storage → `StoredMediaAsset`; **`rawOutputUrl` never persisted** as canonical `output_url` |
| **High-tier path without gates** | Policy selects HeyGen but skips consent/budget | High-tier create through same orchestrator gates as low-tier; allowlist includes `heygen_high` only after Phase B |
| **Override without audit** | Untraceable margin / abuse | Fallback records override (operator id, reason key e.g. `operator_heygen_fallback`, timestamp) — US-8.4 / US-10.2 audit spirit; CONTRACT picks table vs job metadata jsonb |

**Residual risk accepted:** Compromise of deploy env exposes `HEYGEN_API_KEY` (ops). HeyGen account compromise is vendor-side. Operator trust — Operators may intentionally spend high tier (product intent) within budget gate. Poll-only V1 omits webhook auth until a future story adds signed callbacks. Cost seed correction (7→2 ¢/sec) is product accuracy, not a security bypass if estimate remains server-driven.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `HEYGEN_API_KEY` | **Critical** — direct financial abuse | Server adapter module only; `X-Api-Key` header; never persisted or serialized |
| Optional `HEYGEN_DEFAULT_AVATAR_ID` (studio) | Medium — config | Server env / adapter factory only — not client-writable |
| HeyGen API create/status JSON | **Untrusted** | Parsed → US-8.1 normalizers → orchestrator/poller |
| HeyGen delivery / CDN URLs | **Untrusted** — SSRF vector | Frozen **`HEYGEN_ALLOWED_OUTPUT_HOSTS`**; transient until `fetchAsset` |
| Portrait / voiceover bytes | **High** — likeness / voice | Owned media + signed M1 URLs or server `avatar_id` |
| `neuramark_video_jobs` HeyGen rows | **High** — spend + production | `provider_key = heygen_high`, `provider_tier = high`; service-role writes; poller-only status |
| Operator fallback override audit | Medium — accountability | Append-only / immutable metadata; Operator write |
| Estimate / cost fields | **High** — margin | Operator-gated serializers only (US-7.4); never Cliente |
| Browser “Generate with HeyGen” UI | Low — presentation | Hide for non-operator; server enforces |

**Boundaries:**

1. **Browser (Cliente) → job APIs** — Untrusted. **No** HeyGen create / fallback / provider fields. Status poll read-only + IDOR 404.
2. **Browser (Operator) → fallback / high-tier create** — Untrusted intent only. **`requireOperator` first.** Confirm estimate is presentation; server re-estimates.
3. **Orchestrator → policy | fallback force → gates → registry → HeyGen adapter** — Server owns `provider_key`; client never supplies it.
4. **Adapter → `https://api.heygen.com`** — Key in `X-Api-Key`; create/status only to frozen base + paths; explicit non–IV engine on create.
5. **Adapter / worker → HeyGen CDN** — Allowlisted https GET in `fetchAsset` only; stream to Storage.
6. **Poller (US-8.4)** — Unchanged; loads `provider_key` from job row — never from client.

---

## Abuse Cases Considered

- *As a malicious actor, I read `HEYGEN_API_KEY` from a job status API response* → **Blocked:** key never in DTOs; closed schemas; redaction tests.
- *As a Cliente, I click or POST “Generate with HeyGen”* → **Blocked:** `requireOperator` → **403**; FE must not expose action to Cliente sessions.
- *As a malicious actor, I POST `{ provider_key: "heygen_high" }` on normal talking-head create while tier is `low`* → **Blocked:** `FORBIDDEN_FIELDS`; policy never selects `heygen_high` on low.
- *As a malicious actor, I rely on catalog `active = true` to make low-tier resolve HeyGen* → **Blocked:** tier floor — `row.tier === policyTier` required; test: low + active heygen → never heygen.
- *As a malicious actor, I trigger auto-fallback after SadTalker fails without Operator action* → **Blocked:** no silent path; only explicit fallback action.
- *As a malicious actor, I omit engine so HeyGen bills Avatar IV* → **Blocked:** adapter always sets CONTRACT-frozen non–IV `engine`; test fails if omitted.
- *As a malicious actor, I complete a job whose HeyGen output is `https://169.254.169.254/`* → **Blocked:** `validateProviderOutputUrl` + HeyGen host allowlist before GET.
- *As a malicious actor, I pass `image_url` / `audio_url` as attacker HTTPS in the create body* → **Blocked:** inputs from owned assets / server avatar id only.
- *As a malicious actor, I create HeyGen after revoking avatar consent (`own_avatar`)* → **Blocked:** `assertActiveAvatarConsentForJobs` immediately before `createJob`.
- *As a malicious actor, I create HeyGen over Reel budget* → **Blocked:** `assertReelBudgetAllowsSpend` with server estimate before `createJob`.
- *As a malicious actor, I persist HeyGen raw error containing the API key* → **Blocked:** `sanitizeProviderErrorMessage`.
- *As a malicious actor, I poll another client's HeyGen job* → **Blocked:** US-8.4 IDOR — `client_id` scope → **404**.
- *As a malicious actor, I import the HeyGen adapter in a Client Component* → **Blocked:** `import "server-only"`.
- *As a malicious actor, I retry a failed low-tier job and expect HeyGen without fallback action* → **Blocked:** retry re-resolves policy / parent provider path — low retry stays low; HeyGen only via dedicated fallback.

---

## Security Acceptance Criteria

Story AC from `plan/USER_STORIES.md` → US-8.7 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent paths):**

- [ ] **[SEC] All US-8.2 adapter floors** — server-only vendor key, allowlisted output fetch, server-resolved input assets, mandatory normalizers, `rawOutputUrl` non-persistent, poller-only status writes, budget + consent before `createJob`, IDOR-safe poll *(US-8.2)*
- [ ] **[SEC] All US-8.4 orchestration floors** — closed write surface, retry gates, forbidden job authority fields, Operator-only mutations *(US-8.4)*
- [ ] **[SEC] `provider_key` chosen by the server-side policy engine; a client-supplied provider key is never accepted at job creation** *(US-7.2)*
- [ ] **[SEC] Budget gate runs server-side before vendor I/O** *(US-7.1)*
- [ ] **[SEC] Active avatar consent re-checked at job time for `own_avatar`** *(US-3.2)*
- [ ] **[SEC] High-tier keys unreachable when effective tier is `low`** *(US-7.2)*

**US-8.7 story AC security mapping (existing in USER_STORIES.md):**

- [ ] **[SEC] Never the silent default when `provider_tier = low`** — tier floor + no auto-fallback *(USER_STORIES US-8.7)*
- [ ] **[SEC] Operator-only for fallback trigger; clients cannot request HeyGen directly** *(USER_STORIES US-8.7)*
- [ ] **[SEC] Same consent, budget, download-and-own, webhook/polling security rules as US-8.2** — poll-only V1; if webhook added later, signature verify required *(USER_STORIES US-8.7)*
- [ ] **[SEC] Avatar IV never auto-selected** — explicit non–IV engine on every create *(USER_STORIES US-8.7)*

**Added in this review (binding for US-8.7 BUILD):**

- [ ] **[SEC] (added) `HEYGEN_API_KEY` hygiene:** loaded from `process.env[envKeyName]` (`HEYGEN_API_KEY`) inside **`heygen-high-adapter.ts` only**; missing → **`PROVIDER_CONFIG_MISSING`** before network I/O; transport **`X-Api-Key` header only**; never logged, never in thrown vendor `Error.message` verbatim, never in API responses, never in catalog rows
- [ ] **[SEC] (added) HeyGen HTTP surface confined:** control-plane calls target **`https://api.heygen.com`** only (CONTRACT freezes `POST /v3/videos`, `GET /v3/videos/{id}`); **no** caller-supplied base URL / proxy helper
- [ ] **[SEC] (added) Frozen HeyGen output host allowlist:** **`HEYGEN_ALLOWED_OUTPUT_HOSTS`** in `lib/contracts/heygen-high.ts` — **distinct from Replicate hosts**; extend only via migration + security review; **`validateProviderOutputUrl` in `getJobStatus` and `fetchAsset`**
- [ ] **[SEC] (added) Download-and-own hardening:** `fetchAsset` — max redirects ≤ 3, timeout + max bytes (CONTRACT), Content-Type `video/*` / `video/mp4`; reject non-https; re-validate final URL host; storage key **`neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`**; never persist HeyGen CDN URL as canonical
- [ ] **[SEC] (added) Input asset resolution:** portrait/audio via **owned `media_asset_id`** + **`resolveMediaAssetUrlForProvider`** (or studio **`avatar_id` from server config**); **forbid** client-supplied absolute `image_url` / `audio_url` / `sourceUrl`
- [ ] **[SEC] (added) Explicit non–Avatar-IV engine:** every create payload includes CONTRACT-frozen **`engine`** string that is **not** Avatar IV / V; omitting `engine` is a **BUILD veto**; unit test asserts field present
- [ ] **[SEC] (added) Untrusted response pipeline mandatory:** **`getJobStatus`** → **`normalizeVideoJobStatusResult(vendor, HEYGEN_ALLOWED_OUTPUT_HOSTS)`**; errors → **`sanitizeProviderErrorMessage`**; ids → **`parseExternalJobId`** / **`externalJobIdSchema`**
- [ ] **[SEC] (added) Low tier never selects HeyGen:** with `provider_tier = low` and `heygen_high.active = true`, **`resolveProviderForJob`** for talking-head **must not** return `heygen_high`; automated test required
- [ ] **[SEC] (added) No silent fallback:** job-create / retry / poller paths **must not** switch `provider_key` to `heygen_high` without the dedicated Operator fallback action
- [ ] **[SEC] (added) Operator fallback gate:** Server Action calls **`requireOperator("handler")` first**; eligibility = failed low-tier talking-head parent (CONTRACT-exact); **forces `heygen_high` server-side**; records override audit (operator id, reason key, timestamp); Cliente → **403**
- [ ] **[SEC] (added) Fallback / high-tier gate order:** policy or fallback force → server estimate → **`assertReelBudgetAllowsSpend`** → consent when `own_avatar` → **`adapter.createJob`** → INSERT (`provider_key = heygen_high`, `provider_tier = high`) → spend → enqueue poll
- [ ] **[SEC] (added) Forbidden request fields:** reject **`provider_key` / `providerKey` / `tier` / `providerTier` / `engine` / Avatar IV flags / cost drivers** with **`FORBIDDEN_FIELDS`** on create and fallback schemas
- [ ] **[SEC] (added) Orchestrator allowlist:** `isAllowedTalkingHeadProviderKey` includes **`heygen_high`** only with Phase B unlock; adapter lookup from **server decision**, never request body
- [ ] **[SEC] (added) Registry swap:** production bootstrap registers **`createHeygenHighAdapter`**; stub not used in production path; HeyGen HTTP only under **`lib/providers/**`**
- [ ] **[SEC] (added) Module boundary:** **`import "server-only"`** on adapter + contracts consumed by adapter; no HeyGen SDK/key in Client Components
- [ ] **[SEC] (added) Poll-only V1:** **no** HeyGen webhook Route Handler in this story; status writes remain US-8.4 poller-only
- [ ] **[SEC] (added) Automated security tests cover at least:** (1) missing `HEYGEN_API_KEY` → `PROVIDER_CONFIG_MISSING`; (2) mock HeyGen error with key material → sanitized output has no key substring; (3) `validateProviderOutputUrl` rejects non-allowlisted / metadata IP hosts; (4) create payload always includes non–IV `engine`; (5) `provider_tier=low` + active catalog → never `heygen_high`; (6) fallback without operator → **403**; (7) fallback without failed low parent → rejected; (8) budget + consent spies called before `createJob` on HeyGen path; (9) client `provider_key` → `FORBIDDEN_FIELDS`; (10) adapter imports `server-only`; (11) estimate uses server duration not client cost fields

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. API key — **server-only, never crosses trust boundary** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Env var | **`HEYGEN_API_KEY`** — matches catalog `heygen_high.env_key_name` |
| Load site | `lib/providers/video/heygen-high-adapter.ts` only |
| Transport | **`X-Api-Key: ${token}`** on HeyGen API calls only |
| Missing key | Fail closed before network I/O |
| Forbidden | Logs, DTOs, DB, `NEXT_PUBLIC_`, catalog secret columns |

**Condition:** CONTRACT documents redaction test vectors; forbids verbose vendor debug logging in production path.

#### 2. Never silent default on low — **tier floor + no auto-fallback** (APPROVE)

| Rule | Detail |
|---|---|
| Policy | `provider_tier = low` → never `heygen_high` (even when active) |
| Activate | Phase B `active = true` enables **high-tier select only** |
| Failure | Low-tier failure does **not** auto-create HeyGen |
| Retry | Low-tier retry stays on low provider keys |

#### 3. Operator fallback — **`requireOperator` + eligibility + audit** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Auth | **`requireOperator("handler")` first** |
| Eligibility | Latest talking-head job failed + `provider_key ∈ { sadtalker_low, musetalk_low }` (CONTRACT may extend) |
| Authority | Server sets `provider_key = heygen_high` — **not** client field |
| Audit | Operator id + reason key + timestamp (US-8.4 / US-10.2 spirit) |
| Gates | Full budget + consent before create |

**Condition:** CONTRACT freezes action name, eligibility SQL shape, and override storage (table vs jsonb).

#### 4. Avatar IV — **explicit engine, never default** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Create body | Always include frozen non–IV `engine` |
| Forbidden | Omitting `engine`; client `engine` / Avatar IV toggles |
| Scope | No Avatar IV/V catalog row or UI in V1 |

**Condition:** CONTRACT freezes exact engine string against current HeyGen v3 docs before BUILD.

#### 5. SSRF / download-and-own — **HeyGen-specific allowlist** (APPROVE WITH CONDITIONS)

| Layer | Control |
|---|---|
| Output | **`HEYGEN_ALLOWED_OUTPUT_HOSTS`** + `validateProviderOutputUrl` |
| Input | Signed owned-media URLs or server `avatar_id` |
| Persistence | Storage key after `fetchAsset`; no long-lived CDN canonical |

**Condition:** CONTRACT lists exact host array (do not copy Replicate list blindly).

#### 6. Untrusted responses — **normalize before persist/display** (APPROVE)

Same pipeline as US-8.2: status enum, sanitized errors, opaque ids, drop extra JSON, transient `rawOutputUrl` only.

#### 7. Consent / budget — **same order as US-8.2** (APPROVE)

Applies to **both** high-tier policy path and operator fallback path. Server duration drives estimate — never client cost drivers.

#### 8. Phase split — **A adapter, B unlock** (APPROVE)

| Phase | Security closure |
|---|---|
| A | Adapter + normalizers + mocked key/SSRF/engine tests (catalog may stay inactive) |
| B | Activate + orchestrator + `requireOperator` fallback + FE + consent/budget E2E |

Full USER_STORIES AC requires both phases; SECURITY AC applies to both before VALIDATION sign-off.

---

## Future-Proofing Notes

- **HeyGen webhooks:** If added later, require signature/secret verify + bind `(external_job_id, provider_key)` before any status write — same as US-8.4 Replicate webhook bar. V1 must not ship an unauthenticated callback.
- **Avatar IV / V:** Future catalog rows must stay `active = false` until explicit product + SECURITY review; never become default by omitting `engine`.
- **US-8.5 Wan:** Copy per-vendor allowlist + key hygiene; shared normalizers unchanged.
- **Multi-tenancy / US-14.5:** `client_id` on jobs + ownership checks; `requireOperator` already correct shape.
- **Catalog `capabilities.allowedOutputHosts`:** Prefer catalog mirror of **`HEYGEN_ALLOWED_OUTPUT_HOSTS`** with adapter constant fallback for tests.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before BUILD starts, verify CONTRACT:

- [ ] `heygen-high-adapter.ts` path + `server-only`; registry registers real adapter
- [ ] **`HEYGEN_API_KEY`** + `X-Api-Key` + missing-key behavior
- [ ] Frozen **non–Avatar-IV `engine`** string; omit forbidden
- [ ] **`HEYGEN_ALLOWED_OUTPUT_HOSTS`** + `validateProviderOutputUrl` at status + fetch
- [ ] Download hardening (timeout, max bytes, redirects, Content-Type)
- [ ] Input resolution: owned media / server `avatar_id` — no client URLs
- [ ] Mandatory normalizers for all HeyGen JSON
- [ ] Gate order: policy|fallback → estimate → budget → consent → create
- [ ] Low tier never → `heygen_high`; no silent fallback
- [ ] Operator fallback: `requireOperator`, eligibility, audit, forbidden fields
- [ ] Orchestrator allowlist includes `heygen_high` (Phase B)
- [ ] Cost model `per_second` × server duration; seed correction documented
- [ ] Poll-only V1 — no webhook endpoint
- [ ] Security test matrix (key, SSRF, engine, tier floor, fallback 403, gates)
- [ ] Explicit out-of-scope: Avatar IV UI, Wan, live HeyGen CI, new job DDL

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — **media-pipeline-engineer** (primary) and **nextjs-backend** may author `plan/stories/US-8.7/CONTRACT.md`. **nextjs-frontend** reviews FE surface (Operator action). Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **`HEYGEN_API_KEY` server-only** + redaction tests; (2) **explicit non–IV engine**; (3) **`HEYGEN_ALLOWED_OUTPUT_HOSTS`** + download-and-own; (4) **mandatory normalizers**; (5) **low never silent HeyGen** + no auto-fallback; (6) **`requireOperator` fallback** + eligibility + audit; (7) **consent/budget gate order**; (8) **forbidden client `provider_key`**; (9) security test matrix |
| **REDESIGN** | CONTRACT allows client-authoritative `provider_key` / `engine`; silent low→HeyGen path; persists HeyGen CDN as canonical; omits allowlist; skips budget/consent; Avatar IV by omitting engine |
| **VETO (do not BUILD)** | Client Component imports HeyGen adapter; fallback without `requireOperator`; `fetch(userSuppliedUrl)` without allowlist; webhook without signature; production bootstrap keeps stub while claiming real adapter |

### Conditions before BUILD (binding — condition count = 12)

1. **Anti–API-key-leakage:** `HEYGEN_API_KEY` env-only in adapter; sanitize; closed DTOs; no key in logs/errors/responses.
2. **Anti–silent-low-default:** tier floor test; activating catalog does not change low routing.
3. **Anti–silent-fallback:** no auto-upgrade after low failure; low retry stays low.
4. **Anti–Avatar-IV footgun:** explicit non–IV `engine` on every create; omit = veto.
5. **Anti–fallback-abuse:** `requireOperator` + eligibility + override audit; Cliente 403.
6. **Anti–provider smuggling:** forbid client `provider_key` / tier / engine / cost drivers; server forces key on fallback.
7. **Anti–SSRF (output):** HeyGen host allowlist + `validateProviderOutputUrl` + redirect re-validation.
8. **Anti–SSRF (input):** owned media / server avatar id only — no client absolute URLs.
9. **Anti–untrusted-response:** US-8.1 normalizers on all HeyGen JSON; opaque ids; enum status; sanitized errors.
10. **Anti–CDN-as-canonical:** download-and-own; `rawOutputUrl` non-persistent.
11. **Anti–gate-bypass:** budget + consent immediately before `createJob` on high-tier and fallback paths.
12. **Anti–module-leak:** `server-only`; HeyGen HTTP under `lib/providers/**`; poll-only (no unauthenticated webhook).

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any REDESIGN finding blocks BUILD until CONTRACT revision.

---

## CONTRACT freeze list (binding summary)

1. **Secrets:** `HEYGEN_API_KEY` server-only; `X-Api-Key`; never in DB/DTOs/logs.
2. **Engine:** Explicit non–Avatar-IV; never omit.
3. **SSRF:** `HEYGEN_ALLOWED_OUTPUT_HOSTS` + validate before fetch; inputs from owned media / server avatar id.
4. **Responses:** Normalizers + sanitize; no raw vendor persistence.
5. **Tier:** Low never selects `heygen_high`; activate does not change low routing.
6. **Fallback:** Operator-only; failed low parent; server-forced key; audited override.
7. **Gates:** estimate → budget → consent → create (high + fallback).
8. **Authority:** No client `provider_key` / tier / engine.
9. **Ownership:** Download-and-own Storage; poller-only status writes.
10. **Tests:** Key, SSRF, engine, tier floor, fallback 403, gates, `server-only`.

---

## BUILD vetoes (summary)

1. **`HEYGEN_API_KEY` in Client Component bundle, API response, job DTO, or catalog secret column.**
2. **`createJob` omitting `engine` or selecting Avatar IV/V.**
3. **`resolveProviderForJob` returning `heygen_high` when `provider_tier = low`.**
4. **Silent auto-create of HeyGen after low-tier failure without Operator fallback action.**
5. **Fallback / Generate-with-HeyGen callable without `requireOperator("handler")`.**
6. **Client-supplied `provider_key` / `tier` / `engine` accepted as authority.**
7. **`fetchAsset` / `getJobStatus` fetching URL without `validateProviderOutputUrl` + HeyGen allowlist.**
8. **Portrait/audio from client-supplied absolute URLs.**
9. **Persisting raw HeyGen JSON, raw status strings, or CDN `rawOutputUrl` as canonical output.**
10. **`createJob` without preceding budget gate (and consent when `own_avatar`).**
11. **`getVideoAdapter(` with request-derived `providerKey`.**
12. **HeyGen webhook Route Handler without signature verification (prefer: no webhook in V1).**
13. **Missing security tests for key redaction, tier floor, engine-not-omitted, fallback 403, and SSRF rejection.**

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — not REDESIGN because US-8.7 correctly **extends** the proven US-8.2 adapter + US-8.4/8.6 orchestration patterns to a new vendor, with the right product controls already frozen by PO (tier floor, operator-only fallback, Avatar IV never auto-selected, download-and-own). Incremental risk is **high unit cost + Avatar IV API default + separate CDN allowlist + privileged fallback action** — all manageable when the **12 conditions** above are CONTRACT-frozen and testable.

**Recommended action:** Proceed to **CONTRACT.md** with **media-pipeline-engineer** + **nextjs-backend** (+ FE review for Operator action); security-architect post-CONTRACT spot-check expected **APPROVE WITH CONDITIONS** when the freeze list is encoded.

---

## Gate summary

| Field | Value |
|---|---|
| **Verdict** | **APPROVE WITH CONDITIONS** |
| **Condition count** | **12** |
| **Veto** | No |
| **Next gate** | CONTRACT.md |
