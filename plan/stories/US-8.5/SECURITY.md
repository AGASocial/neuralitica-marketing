# Security Design Review — US-8.5

**Story:** US-8.5 — Wan B-roll adapter (low tier, P0)  
**Date:** 2026-08-31  
**Reviewer:** security-architect  
**Sources:** `plan/stories/US-8.5/README.md`, `plan/stories/US-8.5/TASKS.md`, `plan/USER_STORIES.md` (US-8.5 AC + `[SEC]`), `plan/SECURITY_BASELINE.md` § Video Provider, `plan/stories/US-8.2/SECURITY.md` (SadTalker — download-and-own / allowlist / normalizers), `plan/stories/US-8.6/SECURITY.md` (orchestrator + server-resolved inputs), `plan/stories/US-8.7/SECURITY.md` (per-vendor key hygiene + gate order), `plan/stories/US-8.1/SECURITY.md` (adapter contract), `plan/stories/US-8.4/SECURITY.md` (poller / retry / job tenancy), `plan/stories/US-7.1/SECURITY.md` (budget), `plan/stories/US-7.2/SECURITY.md` (policy / forbidden `providerKey`), `plan/stories/US-9.3/SECURITY.md` + CosyVoice2 (`SILICONFLOW_API_KEY` shared), `plan/stories/US-X.4/SECURITY.md` (catalog `siliconflow_wan21_turbo`)  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementer:** **media-pipeline-engineer** (Wan / SiliconFlow adapter, `fetchAsset`, mocked-HTTP tests). **nextjs-backend** co-authors `CONTRACT.md` for Phase B B-roll orchestrator, budget/degrade, registry wiring. **nextjs-frontend:** N/A — preview strip deferred.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: a **real SiliconFlow Wan2.1 I2V Turbo `VideoProviderAdapter`** for catalog key **`siliconflow_wan21_turbo`**, replacing the US-8.1 stub, with **server-only `SILICONFLOW_API_KEY`**, **download-and-own** + **vendor-specific host allowlist**, **`videoAssetRole: broll`**, **per-clip cost against Reel cumulative budget (US-7.1)**, **no client `provider_key`**, and **Phase B graceful degrade** that keeps talking-head **`primary` independent** without leaking secrets in failure paths.

No REDESIGN / VETO. The seven primary Wan/B-roll threats — **shared SiliconFlow key leakage**, **untrusted SiliconFlow JSON**, **SSRF via output / reference-image URLs**, **budget bypass via N clips**, **client `provider_key` / prompt smuggling**, **degrade paths leaking secrets**, **`asset_role` / tenancy confusion** — are addressable with concrete acceptance criteria inherited from US-8.2/8.4/8.6/8.7 and CosyVoice2, extended below. Orchestrator may proceed to **CONTRACT.md** after encoding the items below.

**Condition count:** **12** binding conditions (must land in CONTRACT + BUILD; see § Conditions before BUILD).

**Primary threats modeled:**

| Threat | Abuse class |
|---|---|
| **`SILICONFLOW_API_KEY` leakage** | Shared key (LLM/TTS/Wan) in Client Component bundle, job DTOs, logs, error messages, catalog rows, or degrade/failure panels; SiliconFlow error bodies echo Bearer token |
| **Untrusted SiliconFlow responses** | Raw status/error/JSON/task ids persisted or rendered → XSS, state forgery, opaque-id path traversal |
| **SSRF via Wan output URL** | Compromised status returns internal/metadata or arbitrary HTTPS host; `fetchAsset` follows without allowlist |
| **SSRF via I2V reference image** | Adapter posts client-supplied `image_url` / absolute HTTPS to SiliconFlow or fetches attacker URL as still |
| **B-roll budget bypass** | Skip `assertReelBudgetAllowsSpend`; under-count clips; trust client cost; create N uncapped jobs |
| **Client `provider_key` / prompt authority** | Body forces Wan / free-form prompt as sole create authority; bypass policy / script beats |
| **Graceful-degrade secret leak** | B-roll failure handlers log vendor bodies / Authorization headers; Operator UI shows raw SiliconFlow errors |
| **`asset_role` / tenancy confusion** | Wan jobs written as `primary`; B-roll rows without `client_id`; poller/retry converts B-roll → primary / HeyGen; IDOR across tenants |

**Inherited floors (US-8.1 / US-8.2 / US-8.4 / US-8.6 / US-8.7 / US-7.2 / US-7.1 / US-9.3 / US-X.4 / US-14.5 — do not weaken):** registry lookup from `resolveProviderForJob` output only; `FORBIDDEN_PROVIDER_AUTHORITY_KEYS` / `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` on create paths; `normalizeVideoJobStatusResult` / `sanitizeProviderErrorMessage` / `validateProviderOutputUrl` mandatory; `rawOutputUrl` transient and non-persistent; poller-only status writes; budget immediately before `createJob`; IDOR-safe poll → 404; vendor HTTP only under `lib/providers/**`; CosyVoice2-style Bearer header auth for SiliconFlow; interim hardcoded user is sanctioned — not a finding.

**This story owns:** Real **`siliconflow_wan21_turbo`** adapter; `lib/contracts/siliconflow-wan21-turbo.ts` (env key, API base/paths, model id, duration caps, MIME allowlists, **Wan/SiliconFlow output hosts**); registry stub → real swap; `estimateCost` = catalog **`per_clip` × clipCount** (**21¢**/clip); Phase B **`createBrollVideoJobs`** (CONTRACT name) with **`asset_role = broll`**, per-clip budget, **graceful degrade vs primary**; poller/retry parity for B-roll; security tests for key redaction, SSRF, budget, degrade non-leak, `asset_role` tenancy.

**This story does not own:** US-9.1 Phase B multi-clip stitch; optional FE B-roll preview; high-tier `ltx_broll_high`; talking-head adapter body changes; new `video_jobs` DDL (unless CONTRACT proves gap); live SiliconFlow CI; inventing `wan_broll_low` as a second key; avatar consent gate for B-roll (PO: not required — still budget).

---

### Threat Summary (US-8.5–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **`SILICONFLOW_API_KEY` leakage (env → client)** | Financial abuse of shared SiliconFlow account (LLM + TTS + Wan) | Key read **only** inside `lib/providers/video/siliconflow-wan21-turbo-adapter.ts` via catalog `envKeyName`; **`import "server-only"`**; never `NEXT_PUBLIC_*`; never in Zod response schemas, job DTOs, or DB columns. Sharing env with CosyVoice2/LLM is **acceptable** — same CosyVoice2 hygiene |
| **`SILICONFLOW_API_KEY` leakage (logs / errors / degrade)** | Key in Vercel/Fly logs or Operator failure panel when B-roll fails | SiliconFlow errors → **`sanitizeProviderErrorMessage`** before persist/display; log **`providerKey`, truncated external id, status, error code** only — never full response body or `Authorization` header. **Degrade path must use the same sanitizer** — fail-open for primary must not mean fail-open for secret handling |
| **Untrusted SiliconFlow JSON** | XSS / state forgery / bad ids | Mandatory US-8.1 normalizers; enum status only; sanitized failure only; **`externalJobIdSchema`**; drop unknown fields |
| **SSRF via output URL** | Server fetches internal/metadata hosts | **`WAN_ALLOWED_OUTPUT_HOSTS`** (CONTRACT — **SiliconFlow delivery hosts; do not reuse Replicate/HeyGen lists**); **`validateProviderOutputUrl`** in `getJobStatus` and `fetchAsset`; https only; redirect re-validate; timeout + max bytes |
| **SSRF via I2V reference still** | Adapter posts attacker URL as image input | Reference still from **server-resolved owned `media_asset_id`** via **`resolveMediaAssetUrlForProvider`** (signed M1) + image MIME allowlist — **never** client absolute `image_url` / `sourceUrl`. Fail closed if no owned still |
| **Prompt injection / free-form client prompt** | Steer Wan generation; exfil via prompt | Prompt **server-authored** from `brollBeats` + script snippets with clear delimiters; reject client free-text as **sole** create authority (`FORBIDDEN_FIELDS` / discard). Beat text treated as **untrusted data** inside server wrap |
| **Budget bypass / clip spam** | Margin breach via many B-roll jobs | Per-clip **`estimateCost` (21¢)** → **`assertReelBudgetAllowsSpend`** **before each** `createJob`; CONTRACT **max clips** (lean **8**); over-budget skips/fails **that** B-roll create only — does **not** abort primary |
| **Client `provider_key` / tier smuggling** | Force Wan or other vendor | Reject **`FORBIDDEN_FIELDS`**: `providerKey`, `provider_key`, `tier`, `providerTier`, cost drivers. Policy / orchestrator owns key |
| **Graceful degrade couples primary** | Product AC breach + confused failure surface | B-roll create/poll/retry failure **never** fails, cancels, or blocks talking-head **`primary`**. Independent job rows. Tests required |
| **`asset_role` written as `primary`** | Wrong assembly / spend attribution / poller confusion | Adapter **`videoAssetRole: "broll"`**; INSERT **`asset_role = broll` only**; retry stays B-roll + Wan — never converts to primary / HeyGen |
| **B-roll IDOR / missing tenancy** | Cross-tenant job/asset access | Every row **`client_id NOT NULL`**; lookups parameterized `(id, client_id, provider_key)`; poller verifies tenant before adapter call; storage key **`neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`** |
| **Long-lived SiliconFlow CDN as canonical** | Hotlink abuse + SSRF replay | **`fetchAsset`** download-and-own → Storage → `StoredMediaAsset`; **`rawOutputUrl` never persisted** as canonical |

**Residual risk accepted:** Compromise of deploy env exposes shared `SILICONFLOW_API_KEY` (ops — affects LLM/TTS/Wan together). SiliconFlow account compromise is vendor-side. Faceless slots with zero visual after B-roll fail still need Operator manual path (product). Max-8 clips × 21¢ is bounded spend within Reel budget gate. Poll-only V1 (no SiliconFlow webhook in this story).

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `SILICONFLOW_API_KEY` | **Critical** — shared LLM/TTS/Wan financial abuse | Server adapter modules only; `Authorization: Bearer` header; never persisted or serialized |
| SiliconFlow Wan create/status JSON | **Untrusted** | Parsed → US-8.1 normalizers → orchestrator/poller |
| SiliconFlow delivery / CDN URLs | **Untrusted** — SSRF vector | Frozen **`WAN_ALLOWED_OUTPUT_HOSTS`**; transient until `fetchAsset` |
| Reference still bytes (I2V image) | Medium–High — brand / owned media | Owned `media_assets` + signed M1; server-resolved |
| Server-authored B-roll prompts | Medium — derived from client-authored beats | Built server-side; beats delimited as data |
| `neuramark_video_jobs` B-roll rows | **High** — spend + production | `provider_key = siliconflow_wan21_turbo`, **`asset_role = broll`**, `client_id`; poller-only status |
| Estimate / spend events (21¢/clip) | **High** — margin | Server estimate + US-7.1 ledger; Operator-gated cost serializers (US-7.4) |
| Talking-head `primary` jobs | **High** — must stay independent | Degrade must not mutate primary status/spend on B-roll failure |
| Browser surfaces | Low — FE deferred | No new write surface; any future status DTO closed + IDOR-safe |

**Boundaries:**

1. **Browser → B-roll create** — Untrusted. Operator-gated orchestrator only; **no** client `provider_key` / free-form prompt authority / cost drivers. Status poll read-only + IDOR 404 (US-8.4).
2. **Orchestrator → policy → budget → registry → Wan adapter** — Server owns `provider_key`, clip count, prompts, reference still id.
3. **Adapter → SiliconFlow API** — Bearer token; create/status only to frozen host + paths (mirror CosyVoice2 `api.siliconflow.cn` family — CONTRACT exact).
4. **Adapter / worker → SiliconFlow CDN** — Allowlisted https GET in `fetchAsset` only; stream to Storage.
5. **Primary talking-head path** — Unchanged; **must not** await or fail on B-roll.
6. **Poller (US-8.4)** — Processes `asset_role = broll` rows; loads `provider_key` from job row — never from client; no primary-only filter that silently drops B-roll (ops bug) — but must never promote B-roll to primary.

---

## Abuse Cases Considered

- *As a malicious actor, I read `SILICONFLOW_API_KEY` from a B-roll job status or degrade error panel* → **Blocked:** key never in DTOs; sanitize on all failure paths including graceful degrade.
- *As a malicious actor, I POST `{ provider_key: "siliconflow_wan21_turbo" }` while policy selected another path* → **Blocked:** `FORBIDDEN_FIELDS`; policy/orchestrator owns key.
- *As a malicious actor, I pass `image_url: "https://169.254.169.254/"` as the I2V still* → **Blocked:** server-resolved owned media only; signed M1 URLs.
- *As a malicious actor, I complete a job whose SiliconFlow output is an internal URL* → **Blocked:** `validateProviderOutputUrl` + `WAN_ALLOWED_OUTPUT_HOSTS` before GET; redirect re-validation.
- *As a malicious actor, I create 100 B-roll jobs to burn budget* → **Blocked:** max clip cap + per-clip `assertReelBudgetAllowsSpend`; over-budget fails that clip only.
- *As a malicious actor, I skip budget by sending `estimatedCostCents: 0`* → **Blocked:** server `estimateCost` / catalog 21¢ only; client cost fields forbidden.
- *As a malicious actor, I supply free-form prompt as sole Wan input* → **Blocked:** server-authored prompt from beats/script; client free-text not sole authority.
- *As a malicious actor, I fail B-roll and force primary into `failed` via shared handler* → **Blocked:** independent jobs; degrade tests assert primary untouched.
- *As a malicious actor, I write Wan output as `asset_role = primary` to confuse assembly* → **Blocked:** adapter + INSERT force `broll`; retry cannot convert.
- *As a malicious actor, I poll another client's B-roll job* → **Blocked:** US-8.4 IDOR — `client_id` scope → **404**.
- *As a malicious actor, I persist SiliconFlow raw error containing `Bearer sk-…`* → **Blocked:** `sanitizeProviderErrorMessage`.
- *As a malicious actor, I import the Wan adapter in a Client Component* → **Blocked:** `import "server-only"`.
- *As a malicious actor, I rely on missing key to throw a stack trace that includes the env value* → **Blocked:** missing → **`PROVIDER_CONFIG_MISSING`** before I/O; message must not echo secret material.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-8.5 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent paths):**

- [ ] **[SEC] All US-8.1 / US-8.2 adapter floors** — server-only vendor key, allowlisted output fetch, server-resolved input assets, mandatory normalizers, `rawOutputUrl` non-persistent, poller-only status writes, budget before `createJob`, IDOR-safe poll *(US-8.1 / US-8.2)*
- [ ] **[SEC] All US-8.4 orchestration floors** — closed write surface, retry gates, forbidden job authority fields, Operator-only mutations *(US-8.4)*
- [ ] **[SEC] `provider_key` chosen by the server-side policy engine; a client-supplied provider key is never accepted at job creation** *(US-7.2)*
- [ ] **[SEC] Budget gate runs server-side before vendor I/O** *(US-7.1)*
- [ ] **[SEC] CosyVoice2 / SiliconFlow key hygiene pattern for shared `SILICONFLOW_API_KEY`** *(US-9.3)*

**US-8.5 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] Wan adapter follows US-8.1 contract: server-only keys, untrusted-response handling, B-roll cost counted against Reel cumulative budget (US-7.1)** *(USER_STORIES US-8.5)*

**Added in this review (binding for US-8.5 BUILD):**

- [ ] **[SEC] (added) `SILICONFLOW_API_KEY` hygiene:** loaded from `process.env[envKeyName]` (`SILICONFLOW_API_KEY`) inside **`siliconflow-wan21-turbo-adapter.ts` only** (for Wan HTTP); missing → **`PROVIDER_CONFIG_MISSING`** before network I/O; transport **`Authorization: Bearer`** header only; never logged, never in thrown vendor `Error.message` verbatim, never in API responses, never in catalog rows; **do not** invent a Wan-only env name in V1
- [ ] **[SEC] (added) SiliconFlow HTTP surface confined:** control-plane calls target CONTRACT-frozen SiliconFlow host/paths only (lean: same `api.siliconflow.cn` family as CosyVoice2); **no** caller-supplied base URL / proxy helper
- [ ] **[SEC] (added) Frozen Wan output host allowlist:** **`WAN_ALLOWED_OUTPUT_HOSTS`** (or `SILICONFLOW_WAN_ALLOWED_OUTPUT_HOSTS`) in `lib/contracts/siliconflow-wan21-turbo.ts` — **distinct from Replicate/HeyGen**; extend only via migration + security review; **`validateProviderOutputUrl` in `getJobStatus` and `fetchAsset`**
- [ ] **[SEC] (added) Download-and-own hardening:** `fetchAsset` — max redirects ≤ 3, timeout + max bytes (CONTRACT), Content-Type `video/*` / `video/mp4`; reject non-https; re-validate final URL host; storage key **`neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`**; never persist SiliconFlow CDN URL as canonical
- [ ] **[SEC] (added) I2V reference still resolution:** image input via **owned `media_asset_id`** + **`resolveMediaAssetUrlForProvider`** (kind image/portrait) with MIME allowlist; **forbid** client-supplied absolute image URLs; fail closed if no owned still
- [ ] **[SEC] (added) Server-authored prompts:** create path builds prompt from server-loaded `brollBeats` / script fields with delimited untrusted data; reject client free-text as sole prompt authority (`FORBIDDEN_FIELDS` or documented discard)
- [ ] **[SEC] (added) Untrusted response pipeline mandatory:** **`getJobStatus`** → **`normalizeVideoJobStatusResult(vendor, WAN_ALLOWED_OUTPUT_HOSTS)`**; errors → **`sanitizeProviderErrorMessage`**; ids → **`parseExternalJobId`** / **`externalJobIdSchema`**
- [ ] **[SEC] (added) B-roll cost vs Reel budget:** `estimateCost` = catalog **`per_clip` × clipCount** with seed **21¢**/clip; Phase B calls **`assertReelBudgetAllowsSpend`** **per clip** immediately before each `adapter.createJob`; spend event recorded per created clip; client cost fields forbidden
- [ ] **[SEC] (added) Clip count cap:** orchestrator enforces CONTRACT max (lean **8**); uncapped N from client body rejected
- [ ] **[SEC] (added) No client `provider_key`:** create/orchestrator schemas reject **`provider_key` / `providerKey` / `tier` / `providerTier` / cost drivers** with **`FORBIDDEN_FIELDS`**; adapter from **`getVideoAdapter(decision.providerKey)`** only
- [ ] **[SEC] (added) Graceful degrade — independence:** failed / timed-out / budget-blocked B-roll **must not** fail, cancel, or block talking-head **`primary`** create/poll/retry; automated test required
- [ ] **[SEC] (added) Graceful degrade — no secret leak:** B-roll failure handlers, Operator-visible messages, and logs on degrade paths use **sanitized** errors only — same redaction bar as happy-path failures (no Bearer / key substrings)
- [ ] **[SEC] (added) `asset_role = broll` tenancy:** adapter **`videoAssetRole: "broll"`**; every Wan job INSERT sets **`asset_role = broll`**, **`client_id NOT NULL`**, `provider_key = siliconflow_wan21_turbo`; retries stay `broll` + Wan; lookups filter by server-resolved `client_id`; never write Wan as `primary`
- [ ] **[SEC] (added) Poller parity without promotion:** US-8.4 poller picks up `broll` rows; **must not** primary-only-filter them out of processing; **must not** rewrite `asset_role` or switch provider on B-roll retry
- [ ] **[SEC] (added) Registry swap:** production bootstrap registers **`createSiliconflowWan21TurboAdapter`**; stub not used in production path; estimate bootstrap **21** (not stub **10**); Wan HTTP only under **`lib/providers/**`**
- [ ] **[SEC] (added) Module boundary:** **`import "server-only"`** on adapter + contracts consumed by adapter; no SiliconFlow key in Client Components
- [ ] **[SEC] (added) Poll-only V1:** **no** SiliconFlow Wan webhook Route Handler in this story; status writes remain US-8.4 poller-only
- [ ] **[SEC] (added) Automated security tests cover at least:** (1) missing `SILICONFLOW_API_KEY` → `PROVIDER_CONFIG_MISSING`; (2) mock SiliconFlow error with Bearer/key material → sanitized output has no key substring (including degrade/failure path); (3) `validateProviderOutputUrl` rejects non-allowlisted / metadata IP hosts; (4) client absolute image URL rejected; (5) client `provider_key` → `FORBIDDEN_FIELDS`; (6) budget spy called before each clip `createJob`; (7) over-budget B-roll does not mark primary failed; (8) B-roll adapter throw / `failed` status leaves primary successful; (9) INSERT persists `asset_role = broll` + `client_id`; (10) estimate 1 clip = 21¢ / 3 clips = 63¢; (11) adapter imports `server-only`; (12) registry no stub id prefix for `siliconflow_wan21_turbo`

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. API key — **server-only shared SiliconFlow secret** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Env var | **`SILICONFLOW_API_KEY`** — matches catalog `siliconflow_wan21_turbo.env_key_name` (shared with CosyVoice2 / LLM) |
| Load site | `lib/providers/video/siliconflow-wan21-turbo-adapter.ts` for Wan I/O |
| Transport | **`Authorization: Bearer ${token}`** on SiliconFlow API calls only |
| Missing key | Fail closed before network I/O |
| Forbidden | Logs, DTOs, DB, `NEXT_PUBLIC_`, catalog secret columns, Wan-only alternate env name in V1 |

**Condition:** CONTRACT documents redaction test vectors (including degrade path); forbids verbose vendor debug logging in production path.

#### 2. SSRF / download-and-own — **Wan-specific allowlist** (APPROVE WITH CONDITIONS)

| Layer | Control |
|---|---|
| Output | **`WAN_ALLOWED_OUTPUT_HOSTS`** + `validateProviderOutputUrl` |
| Input still | Signed owned-media URLs via resolver; image MIME allowlist |
| Persistence | Storage key after `fetchAsset`; no long-lived CDN canonical |

**Condition:** CONTRACT lists exact host array from current SiliconFlow Wan delivery docs (do not copy Replicate/HeyGen lists).

#### 3. Untrusted responses — **normalize before persist/display** (APPROVE)

Same pipeline as US-8.2: status enum, sanitized errors, opaque ids, drop extra JSON, transient `rawOutputUrl` only — including all graceful-degrade failure surfaces.

#### 4. Budget — **per clip against Reel cumulative** (APPROVE)

| Rule | Detail |
|---|---|
| Estimate | Catalog **`billingUnit: per_clip`**, **`unitCostCents: 21`** × clipCount |
| Gate | **`assertReelBudgetAllowsSpend`** immediately before **each** clip `createJob` |
| Over budget | Skip/fail **that** B-roll job only — primary continues |
| Authority | Server estimate only — no client cost drivers |

#### 5. No client provider authority (APPROVE)

Policy `resolveProviderForJob({ assetRole: "broll", … })` → `siliconflow_wan21_turbo` when low + `needsBroll`. Client body never supplies provider key/tier.

#### 6. Graceful degrade — **independence + secret hygiene** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Independence | B-roll failure never mutates primary job status/cancel |
| Secrets | Degrade uses same sanitizer / closed DTOs as other failures |
| Assembly | US-9.1 Phase B skips missing B-roll (handoff — out of BUILD) |

**Condition:** CONTRACT + tests name the degrade invariants explicitly (primary untouched; no key in error text).

#### 7. `asset_role = broll` tenancy (APPROVE)

| Rule | Detail |
|---|---|
| Adapter | `videoAssetRole: "broll"` |
| INSERT | `asset_role = broll`, `client_id` required |
| Retry | Stays `broll` + `siliconflow_wan21_turbo` |
| Forbidden | Writing Wan as `primary`; promoting B-roll on retry |

#### 8. Prompts + reference still — **server authority** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Still | Server picks first available owned still (PO lean); fail closed |
| Prompt | Server wrap from beats/script; client free-text not sole authority |
| Duration | Clamp ≤ 5s server-side |

#### 9. Phase split — **A adapter, B orchestrator** (APPROVE)

| Phase | Security closure |
|---|---|
| A | Adapter + normalizers + mocked key/SSRF/estimate tests |
| B | Orchestrator + budget/degrade/`asset_role`/clip-cap tests |

Full USER_STORIES AC requires both phases; SECURITY AC applies to both before VALIDATION sign-off.

---

## Future-Proofing Notes

- **US-9.1 Phase B stitch:** Consume only server-owned `asset_role = broll` media ids — never fetch SiliconFlow URLs at assembly time (US-9.1 SSRF floor).
- **High-tier B-roll (`ltx_broll_high`):** Separate SECURITY review; do not reuse Wan allowlist blindly.
- **Shared `SILICONFLOW_API_KEY`:** Compromised key impacts LLM+TTS+Wan — ops rotation covers all; do not split keys without catalog + SECURITY update.
- **Webhooks:** If SiliconFlow async callbacks are added later, require signature/secret verify + bind `(external_job_id, provider_key)` — prefer poll-only until then.
- **Catalog `capabilities.allowedOutputHosts`:** Prefer catalog mirror of Wan allowlist with adapter constant fallback for tests.
- **Multi-tenancy / US-14.5:** `client_id` on B-roll jobs + ownership checks already correct shape.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before BUILD starts, verify CONTRACT:

- [ ] `siliconflow-wan21-turbo-adapter.ts` path + `server-only`; registry registers real adapter; estimate **21**
- [ ] **`SILICONFLOW_API_KEY`** + Bearer + missing-key behavior; no Wan-only env name
- [ ] **`WAN_ALLOWED_OUTPUT_HOSTS`** + `validateProviderOutputUrl` at status + fetch
- [ ] Download hardening (timeout, max bytes, redirects, Content-Type)
- [ ] Reference still: owned media / signed M1 — no client image URLs
- [ ] Server-authored prompt rules + forbidden client prompt-as-authority
- [ ] Mandatory normalizers for all SiliconFlow Wan JSON
- [ ] Gate order: policy → estimate → budget **per clip** → `createJob`
- [ ] Graceful degrade: primary independence + sanitized errors
- [ ] `asset_role = broll` + `client_id` on INSERT; retry non-promotion
- [ ] Clip max cap; `FORBIDDEN_FIELDS` for provider_key / cost drivers
- [ ] Poll-only V1 — no webhook endpoint
- [ ] Security test matrix (key, SSRF, budget, degrade, tenancy, estimate)
- [ ] Explicit out-of-scope: US-9.1 stitch, FE preview, `ltx_broll_high`, live CI

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — **media-pipeline-engineer** (primary) and **nextjs-backend** may author `plan/stories/US-8.5/CONTRACT.md`. **Reviewed by FE: N/A**. Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **`SILICONFLOW_API_KEY` server-only** + redaction (incl. degrade); (2) **`WAN_ALLOWED_OUTPUT_HOSTS`** + download-and-own; (3) **mandatory normalizers**; (4) **per-clip budget vs US-7.1**; (5) **no client `provider_key`**; (6) **graceful degrade independence + no secret leak**; (7) **`asset_role = broll` tenancy**; (8) **server-resolved still + server-authored prompt**; (9) security test matrix |
| **REDESIGN** | CONTRACT allows client-authoritative `provider_key` / image URL / sole free-form prompt; persists CDN as canonical; omits allowlist; skips per-clip budget; couples primary failure to B-roll; writes Wan as `primary` |
| **VETO (do not BUILD)** | Client Component imports Wan adapter; `fetch(userSuppliedUrl)` without allowlist; key in DTOs/logs; webhook without signature; production bootstrap keeps stub while claiming real adapter; degrade path logs raw vendor bodies |

### Conditions before BUILD (binding — condition count = 12)

1. **Anti–API-key-leakage:** `SILICONFLOW_API_KEY` env-only in Wan adapter; sanitize; closed DTOs; no key in logs/errors/responses (including degrade).
2. **Anti–SSRF (output):** Wan/SiliconFlow host allowlist + `validateProviderOutputUrl` + redirect re-validation.
3. **Anti–SSRF (input):** owned reference still via signed M1 / resolver only — no client absolute image URLs.
4. **Anti–untrusted-response:** US-8.1 normalizers on all SiliconFlow Wan JSON; opaque ids; enum status; sanitized errors.
5. **Anti–CDN-as-canonical:** download-and-own; `rawOutputUrl` non-persistent.
6. **Anti–budget-bypass:** server 21¢/`per_clip` estimate; `assertReelBudgetAllowsSpend` before each clip create; clip max cap.
7. **Anti–provider smuggling:** forbid client `provider_key` / tier / cost drivers; policy owns key.
8. **Anti–prompt authority:** server-authored prompts from beats/script; client free-text not sole authority.
9. **Anti–degrade primary coupling:** B-roll failure never fails/cancels/blocks primary.
10. **Anti–degrade secret leak:** degrade/failure surfaces use sanitized errors only.
11. **Anti–`asset_role` / tenancy confusion:** always `broll` + `client_id`; retry non-promotion; IDOR 404.
12. **Anti–module-leak:** `server-only`; Wan HTTP under `lib/providers/**`; poll-only (no unauthenticated webhook).

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any REDESIGN finding blocks BUILD until CONTRACT revision.

---

## CONTRACT freeze list (binding summary)

1. **Secrets:** `SILICONFLOW_API_KEY` server-only; Bearer header; never in DB/DTOs/logs/degrade panels.
2. **SSRF:** `WAN_ALLOWED_OUTPUT_HOSTS` + validate before fetch; inputs from owned stills only.
3. **Responses:** Normalizers + sanitize; no raw vendor persistence.
4. **Budget:** 21¢ per clip × N; assert before each create; cap N; count against Reel cumulative (US-7.1).
5. **Authority:** No client `provider_key` / cost drivers / sole free-form prompt.
6. **Degrade:** Primary independent; sanitized errors on B-roll failure.
7. **Tenancy:** `asset_role = broll` + `client_id`; retry stays B-roll + Wan.
8. **Ownership:** Download-and-own Storage; poller-only status writes.
9. **Duration:** Clamp ≤ 5s server-side.
10. **Tests:** Key, SSRF, budget, degrade independence + non-leak, tenancy, estimate 21¢, `server-only`.

---

## BUILD vetoes (summary)

1. **`SILICONFLOW_API_KEY` in Client Component bundle, API response, job DTO, catalog secret column, or unsanitized degrade/error text.**
2. **`fetchAsset` / `getJobStatus` fetching URL without `validateProviderOutputUrl` + Wan allowlist.**
3. **I2V image from client-supplied absolute URLs.**
4. **Persisting raw SiliconFlow JSON, raw status strings, or CDN `rawOutputUrl` as canonical output.**
5. **`createJob` without preceding per-clip budget gate.**
6. **Client-supplied `provider_key` / `tier` / cost drivers accepted as authority.**
7. **Client free-text accepted as sole Wan prompt authority.**
8. **B-roll failure/cancel/block of talking-head `primary`.**
9. **Wan jobs INSERT with `asset_role = primary` or without `client_id`.**
10. **B-roll retry that converts to `primary` / HeyGen / other provider without audited Operator path (out of scope here — must not invent).**
11. **`getVideoAdapter(` with request-derived `providerKey`.**
12. **SiliconFlow Wan webhook Route Handler without signature verification (prefer: no webhook in V1).**
13. **Missing security tests for key redaction (incl. degrade), SSRF rejection, budget-per-clip, primary independence, and `asset_role = broll` tenancy.**

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — not REDESIGN because US-8.5 correctly **extends** the proven US-8.2 adapter + US-8.4 orchestration patterns to **SiliconFlow Wan I2V** for **`asset_role = broll`**, with PO freezes already aligned to the security floor (shared env key, download-and-own, graceful degrade, catalog 21¢, no client provider authority, stitch deferred). Incremental risk is **shared SiliconFlow key blast radius**, **I2V image URL SSRF**, **multi-clip budget abuse**, and **degrade paths that forget sanitization** — all manageable when the **12 conditions** above are CONTRACT-frozen and testable.

**Recommended action:** Proceed to **CONTRACT.md** with **media-pipeline-engineer** + **nextjs-backend**; security-architect post-CONTRACT spot-check expected **APPROVE WITH CONDITIONS** when the freeze list is encoded.

---

## Gate summary

| Field | Value |
|---|---|
| **Verdict** | **APPROVE WITH CONDITIONS** |
| **Condition count** | **12** |
| **Veto** | No |
| **Next gate** | CONTRACT.md |
