# Security Design Review — US-8.8

**Story:** US-8.8 — LTX B-roll adapter (high tier, P1)  
**Date:** 2026-08-31  
**Branch:** `feature/US-8.8-ltx-broll-high`  
**Reviewer:** security-architect  
**Sources:** `plan/stories/US-8.8/README.md`, `plan/stories/US-8.8/TASKS.md`, `plan/USER_STORIES.md` (US-8.8 AC + `[SEC]`), `plan/SECURITY_BASELINE.md` § Video Provider, `plan/stories/US-8.5/SECURITY.md` (Wan B-roll — primary mirror), `plan/stories/US-8.2/SECURITY.md` (SadTalker — download-and-own / allowlist / normalizers), `plan/stories/US-8.6/SECURITY.md` (orchestrator + server-resolved inputs), `plan/stories/US-8.7/SECURITY.md` (per-vendor key hygiene + catalog activate), `plan/stories/US-8.1/SECURITY.md` (adapter contract), `plan/stories/US-8.4/SECURITY.md` (poller / retry / job tenancy), `plan/stories/US-7.1/SECURITY.md` (budget), `plan/stories/US-7.2/SECURITY.md` (policy / tier floor / forbidden `providerKey`), `plan/stories/US-X.4/SECURITY.md` (catalog `ltx_broll_high` seed), `plan/stories/US-9.1/SECURITY.md` (assembly SSRF floor — owned `broll` handoff)  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementer:** **media-pipeline-engineer** (FAL LTX adapter, `fetchAsset`, mocked-HTTP tests). **nextjs-backend** co-authors `CONTRACT.md` for Phase B orchestrator extension, budget/degrade, registry wiring, catalog activate migration. **nextjs-frontend:** N/A — preview strip deferred.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: a **real FAL LTX `VideoProviderAdapter`** for catalog key **`ltx_broll_high`**, with **server-only `FAL_API_KEY`**, **download-and-own** + **FAL-specific host allowlist**, **`videoAssetRole: broll`**, **per-clip cost against Reel cumulative budget (US-7.1)** at **126¢/clip**, **tier floor** (`provider_tier = low` never selects LTX), **no client `provider_key`**, and **Phase B graceful degrade** via extended **`createBrollVideoJobs`** that keeps talking-head **`primary` independent** without leaking secrets in failure paths.

No REDESIGN / VETO. The eight primary LTX/B-roll threats — **`FAL_API_KEY` leakage**, **untrusted FAL JSON**, **SSRF via output URLs**, **SSRF via I2V reference-image URLs**, **budget bypass via N high-cost clips**, **client `provider_key` / tier smuggling**, **degrade paths leaking secrets**, **tier-floor bypass (silent LTX on low)**, **`asset_role` / tenancy confusion** — are addressable with concrete acceptance criteria inherited from US-8.5 Wan and adjacent adapter stories, extended below. Orchestrator may proceed to **CONTRACT.md** after encoding the items below.

**Condition count:** **13** binding conditions (must land in CONTRACT + BUILD; see § Conditions before BUILD).

**Primary threats modeled:**

| Threat | Abuse class |
|---|---|
| **`FAL_API_KEY` leakage** | Key in Client Component bundle, job DTOs, logs, error messages, catalog rows, or degrade/failure panels; FAL error bodies echo `Key …` token |
| **Untrusted FAL responses** | Raw status/error/JSON/task ids persisted or rendered → XSS, state forgery, opaque-id path traversal |
| **SSRF via LTX output URL** | Compromised status returns internal/metadata or arbitrary HTTPS host; `fetchAsset` follows without allowlist |
| **SSRF via I2V reference image** | Adapter posts client-supplied `image_url` / absolute HTTPS to FAL or fetches attacker URL as still |
| **B-roll budget bypass** | Skip `assertReelBudgetAllowsSpend`; under-count clips; trust client cost; create N uncapped jobs at **126¢** each |
| **Client `provider_key` / tier smuggling** | Body forces `ltx_broll_high` on low tier or bypasses policy / script beats |
| **Tier-floor bypass** | Activating catalog row or orchestrator unlock silently routes low-tier faceless Reels to LTX (~6× Wan cost) |
| **Graceful-degrade secret leak** | B-roll failure handlers log FAL bodies / Authorization headers; Operator UI shows raw FAL errors |
| **`asset_role` / tenancy confusion** | LTX jobs written as `primary`; B-roll rows without `client_id`; poller/retry converts B-roll → primary / HeyGen; IDOR across tenants |

**Inherited floors (US-8.1 / US-8.2 / US-8.4 / US-8.5 / US-8.6 / US-8.7 / US-7.2 / US-7.1 / US-X.4 / US-14.5 — do not weaken):** registry lookup from `resolveProviderForJob` output only; `FORBIDDEN_PROVIDER_AUTHORITY_KEYS` / `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` on create paths; `normalizeVideoJobStatusResult` / `sanitizeProviderErrorMessage` / `validateProviderOutputUrl` mandatory; `rawOutputUrl` transient and non-persistent; poller-only status writes; budget immediately before `createJob`; IDOR-safe poll → 404; vendor HTTP only under `lib/providers/**`; FAL auth via **`Authorization: Key ${token}`** header (FAL-documented — not Bearer); interim hardcoded user is sanctioned — not a finding.

**This story owns:** Real **`ltx_broll_high`** adapter; `lib/contracts/ltx-broll-high.ts` (env key, FAL API base/paths, model id `ltx-2.3-pro`, duration caps, MIME allowlists, **FAL/LTX output hosts**); registry registration; `estimateCost` = catalog **`per_clip` × clipCount** (**126¢**/clip); Phase B **extend `createBrollVideoJobs`** with allowlist `{ siliconflow_wan21_turbo + low, ltx_broll_high + high }`; per-clip budget; **graceful degrade vs primary**; catalog **activate migration**; poller/retry parity for LTX B-roll; security tests for key redaction, SSRF, budget, tier floor, degrade non-leak, `asset_role` tenancy.

**This story does not own:** US-9.1 Phase B multi-clip stitch (handoff — consume owned clips only); optional FE B-roll preview; low-tier Wan adapter changes beyond shared orchestrator generalization; talking-head adapter body changes; new `video_jobs` DDL (unless CONTRACT proves gap); live FAL CI; inventing a second LTX key; avatar consent gate for B-roll (PO: not required — still budget); Operator fallback UI (policy-driven unlike HeyGen).

---

### Threat Summary (US-8.8–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **`FAL_API_KEY` leakage (env → client)** | Financial abuse of FAL account | Key read **only** inside `lib/providers/video/ltx-broll-high-adapter.ts` via catalog `envKeyName`; **`import "server-only"`**; never `NEXT_PUBLIC_*`; never in Zod response schemas, job DTOs, or DB columns |
| **`FAL_API_KEY` leakage (logs / errors / degrade)** | Key in Vercel logs or Operator failure panel when B-roll fails | FAL errors → **`sanitizeProviderErrorMessage`** before persist/display; log **`providerKey`, truncated external id, status, error code** only — never full response body or `Authorization` header. **Degrade path must use the same sanitizer** |
| **Untrusted FAL JSON** | XSS / state forgery / bad ids | Mandatory US-8.1 normalizers; enum status only; sanitized failure only; **`externalJobIdSchema`**; drop unknown fields |
| **SSRF via output URL** | Server fetches internal/metadata hosts | **`LTX_ALLOWED_OUTPUT_HOSTS`** (CONTRACT — **FAL delivery hosts; do not reuse Wan/SiliconFlow/Replicate/HeyGen lists**); **`validateProviderOutputUrl`** in `getJobStatus` and `fetchAsset`; https only; redirect re-validate; timeout + max bytes |
| **SSRF via I2V reference still** | Adapter posts attacker URL as image input | Reference still from **server-resolved owned `media_asset_id`** via **`getBrollReferenceStillAssetForClient`** + **`resolveMediaAssetUrlForProvider`** (signed M1) + image MIME allowlist — **never** client absolute `image_url` / `sourceUrl`. Fail closed if no owned still |
| **Prompt injection / free-form client prompt** | Steer LTX generation; exfil via prompt | Prompt **server-authored** from `brollBeats` + script snippets with LTX-specific delimiters; reject client free-text as **sole** create authority (`FORBIDDEN_FIELDS` / discard). Beat text treated as **untrusted data** inside server wrap |
| **Budget bypass / clip spam** | Margin breach via many **126¢** B-roll jobs (8 clips ≈ **$10.08**) | Per-clip **`estimateCost` (126¢)** → **`assertReelBudgetAllowsSpend`** **before each** `createJob`; CONTRACT **max clips** (lean **8**, shared with Wan); over-budget skips/fails **that** B-roll create only — does **not** abort primary |
| **Client `provider_key` / tier smuggling** | Force LTX on low tier or other vendor | Reject **`FORBIDDEN_FIELDS`**: `providerKey`, `provider_key`, `tier`, `providerTier`, cost drivers. Policy / orchestrator owns key + tier pairing |
| **Tier-floor bypass** | Low-tier clients billed at high-tier LTX rates | Orchestrator allowlist **requires** `(ltx_broll_high, high)` pair; policy **`resolveProviderForJob`** never returns LTX when `provider_tier = low`; automated tests: low + `needsBroll` → Wan only |
| **Graceful degrade couples primary** | Product AC breach + confused failure surface | B-roll create/poll/retry failure **never** fails, cancels, or blocks talking-head **`primary`**. Independent job rows. Tests required |
| **`asset_role` written as `primary`** | Wrong assembly / spend attribution / poller confusion | Adapter **`videoAssetRole: "broll"`**; INSERT **`asset_role = broll` only**; retry stays B-roll + LTX — never converts to primary / HeyGen |
| **B-roll IDOR / missing tenancy** | Cross-tenant job/asset access | Every row **`client_id NOT NULL`**; lookups parameterized `(id, client_id, provider_key)`; poller verifies tenant before adapter call; storage key flat **`{uuid}.mp4`** per US-8.5 CONTRACT amendment |
| **Long-lived FAL CDN as canonical** | Hotlink abuse + SSRF replay | **`fetchAsset`** download-and-own → Storage → `StoredMediaAsset`; **`rawOutputUrl` never persisted** as canonical |

**Residual risk accepted:** Compromise of deploy env exposes `FAL_API_KEY` (ops — FAL-only blast radius, distinct from SiliconFlow). FAL account compromise is vendor-side. Faceless slots with zero visual after B-roll fail still need Operator manual path (product). Max-8 clips × 126¢ is bounded spend within Reel budget gate but **materially higher** than Wan — budget gate is critical. Poll-only V1 (no FAL webhook in this story).

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `FAL_API_KEY` | **Critical** — direct FAL financial abuse | Server adapter modules only; `Authorization: Key` header; never persisted or serialized |
| FAL create/status JSON | **Untrusted** | Parsed → US-8.1 normalizers → orchestrator/poller |
| FAL delivery / CDN URLs | **Untrusted** — SSRF vector | Frozen **`LTX_ALLOWED_OUTPUT_HOSTS`**; transient until `fetchAsset` |
| Reference still bytes (I2V image) | Medium–High — brand / owned media | Owned `media_assets` + signed M1; server-resolved (reuse US-8.5 resolver) |
| Server-authored B-roll prompts | Medium — derived from client-authored beats | Built server-side; beats delimited as data |
| `neuramark_video_jobs` B-roll rows | **High** — spend + production | `provider_key = ltx_broll_high`, **`asset_role = broll`**, `provider_tier = high`, `client_id`; poller-only status |
| Estimate / spend events (126¢/clip) | **High** — margin | Server estimate + US-7.1 ledger; Operator-gated cost serializers (US-7.4) |
| Talking-head `primary` jobs | **High** — must stay independent | Degrade must not mutate primary status/spend on B-roll failure |
| Catalog `ltx_broll_high.active` | **High** — tier routing | Phase B sets `active = true`; policy filters inactive; **must not** change low-tier routing |
| Browser surfaces | Low — FE deferred | No new write surface; any future status DTO closed + IDOR-safe |

**Boundaries:**

1. **Browser → B-roll create** — Untrusted. Operator-gated orchestrator only; **no** client `provider_key` / tier / free-form prompt authority / cost drivers. Status poll read-only + IDOR 404 (US-8.4).
2. **Orchestrator → policy → budget → registry → LTX adapter** — Server owns `provider_key`, tier pairing, clip count, prompts, reference still id. Allowlist enforces `(ltx_broll_high, high)` only.
3. **Adapter → FAL API** — Key header; create/status only to CONTRACT-frozen FAL host + paths (lean: `queue.fal.run` / `fal.run` family — CONTRACT exact).
4. **Adapter / worker → FAL CDN** — Allowlisted https GET in `fetchAsset` only; stream to Storage.
5. **Primary talking-head path** — Unchanged; **must not** await or fail on B-roll.
6. **Policy (US-7.2)** — `provider_tier = low` → **`siliconflow_wan21_turbo` only** for B-roll; LTX never a silent default.
7. **Poller (US-8.4)** — Processes `asset_role = broll` rows regardless of `provider_key`; loads key from job row — never from client; must never promote B-roll to primary.

---

## Abuse Cases Considered

- *As a malicious actor, I read `FAL_API_KEY` from a B-roll job status or degrade error panel* → **Blocked:** key never in DTOs; sanitize on all failure paths including graceful degrade.
- *As a malicious actor, I POST `{ provider_key: "ltx_broll_high" }` while policy selected Wan on low tier* → **Blocked:** `FORBIDDEN_FIELDS`; policy/orchestrator owns key; allowlist rejects LTX unless tier is `high`.
- *As a malicious actor, I trigger LTX on a low-tier client after catalog activation* → **Blocked:** policy never resolves `ltx_broll_high` when `provider_tier = low`; orchestrator allowlist rejects `(ltx_broll_high, low)`; tests required.
- *As a malicious actor, I pass `image_url: "https://169.254.169.254/"` as the I2V still* → **Blocked:** server-resolved owned media only; signed M1 URLs.
- *As a malicious actor, I complete a job whose FAL output is an internal URL* → **Blocked:** `validateProviderOutputUrl` + `LTX_ALLOWED_OUTPUT_HOSTS` before GET; redirect re-validation.
- *As a malicious actor, I create 100 B-roll jobs to burn budget at 126¢ each* → **Blocked:** max clip cap + per-clip `assertReelBudgetAllowsSpend`; over-budget fails that clip only.
- *As a malicious actor, I skip budget by sending `estimatedCostCents: 0`* → **Blocked:** server `estimateCost` / catalog 126¢ only; client cost fields forbidden.
- *As a malicious actor, I supply free-form prompt as sole LTX input* → **Blocked:** server-authored prompt from beats/script; client free-text not sole authority.
- *As a malicious actor, I fail B-roll and force primary into `failed` via shared handler* → **Blocked:** independent jobs; degrade tests assert primary untouched.
- *As a malicious actor, I write LTX output as `asset_role = primary` to confuse assembly* → **Blocked:** adapter + INSERT force `broll`; retry cannot convert.
- *As a malicious actor, I poll another client's B-roll job* → **Blocked:** US-8.4 IDOR — `client_id` scope → **404**.
- *As a malicious actor, I persist FAL raw error containing `Key abc-…`* → **Blocked:** `sanitizeProviderErrorMessage`.
- *As a malicious actor, I import the LTX adapter in a Client Component* → **Blocked:** `import "server-only"`.
- *As a malicious actor, I rely on missing key to throw a stack trace that includes the env value* → **Blocked:** missing → **`PROVIDER_CONFIG_MISSING`** before I/O; message must not echo secret material.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-8.8 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent paths):**

- [ ] **[SEC] All US-8.1 / US-8.2 adapter floors** — server-only vendor key, allowlisted output fetch, server-resolved input assets, mandatory normalizers, `rawOutputUrl` non-persistent, poller-only status writes, budget before `createJob`, IDOR-safe poll *(US-8.1 / US-8.2)*
- [ ] **[SEC] All US-8.4 orchestration floors** — closed write surface, retry gates, forbidden job authority fields, Operator-only mutations *(US-8.4)*
- [ ] **[SEC] All US-8.5 B-roll orchestrator floors** — graceful degrade independence, `asset_role = broll`, per-clip budget, server-resolved still, server-authored prompts *(US-8.5 — extend, do not fork)*
- [ ] **[SEC] `provider_key` chosen by the server-side policy engine; a client-supplied provider key is never accepted at job creation** *(US-7.2)*
- [ ] **[SEC] Budget gate runs server-side before vendor I/O** *(US-7.1)*
- [ ] **[SEC] Tier floor: `provider_tier = low` never selects inactive or high-tier-only providers** *(US-7.2 / US-X.4)*

**US-8.8 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] LTX adapter follows US-8.1 contract: server-only `FAL_API_KEY`, untrusted-response handling, B-roll cost counted against Reel cumulative budget (US-7.1)** *(USER_STORIES US-8.8)*

**Added in this review (binding for US-8.8 BUILD):**

- [ ] **[SEC] (added) `FAL_API_KEY` hygiene:** loaded from `process.env[envKeyName]` (`FAL_API_KEY`) inside **`ltx-broll-high-adapter.ts` only** (for FAL HTTP); missing → **`PROVIDER_CONFIG_MISSING`** before network I/O; transport **`Authorization: Key ${token}`** header only (FAL-documented — **not** Bearer); never logged, never in thrown vendor `Error.message` verbatim, never in API responses, never in catalog rows; **do not** invent an LTX-only alternate env name in V1
- [ ] **[SEC] (added) FAL HTTP surface confined:** control-plane calls target CONTRACT-frozen FAL host/paths only (lean: `queue.fal.run` / `fal.run` async queue family for `ltx-2.3-pro`); **no** caller-supplied base URL / proxy helper
- [ ] **[SEC] (added) Frozen LTX output host allowlist:** **`LTX_ALLOWED_OUTPUT_HOSTS`** (or `FAL_LTX_ALLOWED_OUTPUT_HOSTS`) in `lib/contracts/ltx-broll-high.ts` — **distinct from Wan/SiliconFlow/Replicate/HeyGen**; extend only via migration + security review; **`validateProviderOutputUrl` in `getJobStatus` and `fetchAsset`**
- [ ] **[SEC] (added) Download-and-own hardening:** `fetchAsset` — max redirects ≤ 3, timeout + max bytes (CONTRACT), Content-Type `video/*` / `video/mp4`; reject non-https; re-validate final URL host; storage key flat **`{uuid}.mp4`**; never persist FAL CDN URL as canonical
- [ ] **[SEC] (added) I2V reference still resolution:** image input via **owned `media_asset_id`** + **`getBrollReferenceStillAssetForClient`** + **`resolveMediaAssetUrlForProvider`** (kind image/portrait) with MIME allowlist; **forbid** client-supplied absolute image URLs; fail closed if no owned still (reuse US-8.5 resolver — do not fork)
- [ ] **[SEC] (added) Server-authored prompts:** create path builds prompt from server-loaded `brollBeats` / script fields with LTX-specific delimited untrusted data; reject client free-text as sole prompt authority (`FORBIDDEN_FIELDS` or documented discard)
- [ ] **[SEC] (added) Untrusted response pipeline mandatory:** **`getJobStatus`** → **`normalizeVideoJobStatusResult(vendor, LTX_ALLOWED_OUTPUT_HOSTS)`**; errors → **`sanitizeProviderErrorMessage`**; ids → **`parseExternalJobId`** / **`externalJobIdSchema`**
- [ ] **[SEC] (added) B-roll cost vs Reel budget:** `estimateCost` = catalog **`per_clip` × clipCount** with seed **126¢**/clip; Phase B calls **`assertReelBudgetAllowsSpend`** **per clip** immediately before each `adapter.createJob`; spend event recorded per created clip; client cost fields forbidden
- [ ] **[SEC] (added) Clip count cap:** orchestrator enforces CONTRACT max (lean **8**, shared with Wan); uncapped N from client body rejected
- [ ] **[SEC] (added) No client `provider_key` / tier:** create/orchestrator schemas reject **`provider_key` / `providerKey` / `tier` / `providerTier` / cost drivers** with **`FORBIDDEN_FIELDS`**; adapter from **`getVideoAdapter(decision.providerKey)`** only; orchestrator allowlist **`(siliconflow_wan21_turbo, low) OR (ltx_broll_high, high)`** — reject all other pairings
- [ ] **[SEC] (added) Tier floor — never silent LTX on low:** with **`provider_tier = low`**, policy and orchestrator **must not** create `ltx_broll_high` jobs; catalog activation (Phase B) **must not** change low-tier Wan routing; automated test required
- [ ] **[SEC] (added) Graceful degrade — independence:** failed / timed-out / budget-blocked LTX B-roll **must not** fail, cancel, or block talking-head **`primary`** create/poll/retry; automated test required (mirror US-8.5)
- [ ] **[SEC] (added) Graceful degrade — no secret leak:** B-roll failure handlers, Operator-visible messages, and logs on degrade paths use **sanitized** errors only — same redaction bar as happy-path failures (no `Key …` / FAL key substrings)
- [ ] **[SEC] (added) `asset_role = broll` tenancy:** adapter **`videoAssetRole: "broll"`**; every LTX job INSERT sets **`asset_role = broll`**, **`client_id NOT NULL`**, `provider_key = ltx_broll_high`, `provider_tier = high`; retries stay `broll` + LTX; lookups filter by server-resolved `client_id`; never write LTX as `primary`
- [ ] **[SEC] (added) Poller parity without promotion:** US-8.4 poller picks up LTX `broll` rows; **must not** primary-only-filter them out; **must not** rewrite `asset_role` or switch provider on B-roll retry
- [ ] **[SEC] (added) Registry + catalog activate:** production bootstrap registers **`createLtxBrollHighAdapter`** when catalog row present; estimate bootstrap **126**; Phase B migration sets **`active = true`** only for `ltx_broll_high`; LTX HTTP only under **`lib/providers/**`**
- [ ] **[SEC] (added) Module boundary:** **`import "server-only"`** on adapter + contracts consumed by adapter; no FAL key in Client Components
- [ ] **[SEC] (added) Poll-only V1:** **no** FAL webhook Route Handler in this story; status writes remain US-8.4 poller-only
- [ ] **[SEC] (added) Automated security tests cover at least:** (1) missing `FAL_API_KEY` → `PROVIDER_CONFIG_MISSING`; (2) mock FAL error with `Key`/key material → sanitized output has no key substring (including degrade/failure path); (3) `validateProviderOutputUrl` rejects non-allowlisted / metadata IP hosts; (4) client absolute image URL rejected; (5) client `provider_key` → `FORBIDDEN_FIELDS`; (6) budget spy called before each clip `createJob`; (7) over-budget B-roll does not mark primary failed; (8) LTX adapter throw / `failed` status leaves primary successful; (9) INSERT persists `asset_role = broll` + `client_id` + `provider_key = ltx_broll_high`; (10) estimate 1 clip = 126¢ / 3 clips = 378¢; (11) adapter imports `server-only`; (12) **`provider_tier = low` + `needsBroll` never selects `ltx_broll_high`**; (13) orchestrator rejects `(ltx_broll_high, low)` pairing

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. API key — **server-only FAL secret** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Env var | **`FAL_API_KEY`** — matches catalog `ltx_broll_high.env_key_name` |
| Load site | `lib/providers/video/ltx-broll-high-adapter.ts` for FAL I/O |
| Transport | **`Authorization: Key ${token}`** on FAL API calls only (FAL-documented) |
| Missing key | Fail closed before network I/O → **`PROVIDER_CONFIG_MISSING`** |
| Forbidden | Logs, DTOs, DB, `NEXT_PUBLIC_`, catalog secret columns, LTX-only alternate env name in V1 |

**Condition:** CONTRACT documents redaction test vectors (including degrade path); forbids verbose FAL debug logging in production path.

#### 2. SSRF / download-and-own — **LTX-specific allowlist** (APPROVE WITH CONDITIONS)

| Layer | Control |
|---|---|
| Output | **`LTX_ALLOWED_OUTPUT_HOSTS`** + `validateProviderOutputUrl` |
| Input still | Signed owned-media URLs via US-8.5 resolver; image MIME allowlist |
| Persistence | Storage key after `fetchAsset`; no long-lived CDN canonical |

**Condition:** CONTRACT lists exact host array from current FAL LTX delivery docs (e.g. `fal.media`, `v3.fal.media`, `storage.googleapis.com` FAL bucket paths — **verify against live fixture**). **Do not copy Wan/SiliconFlow/Replicate/HeyGen lists.**

#### 3. Untrusted responses — **normalize before persist/display** (APPROVE)

Same pipeline as US-8.5 Wan: status enum, sanitized errors, opaque ids, drop extra JSON, transient `rawOutputUrl` only — including all graceful-degrade failure surfaces.

#### 4. Budget — **per clip against Reel cumulative at 126¢** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Estimate | Catalog **`billingUnit: per_clip`**, **`unitCostCents: 126`** × clipCount |
| Gate | **`assertReelBudgetAllowsSpend`** immediately before **each** clip `createJob` |
| Over budget | Skip/fail **that** B-roll job only — primary continues |
| Authority | Server estimate only — no client cost drivers |

**Condition:** Tests assert 126¢/clip (not Wan 21¢); 8-clip ceiling still enforced — high unit cost makes bypass materially worse than Wan.

#### 5. No client provider authority + tier pairing (APPROVE WITH CONDITIONS)

Policy `resolveProviderForJob({ assetRole: "broll", tier: "high", … })` → `ltx_broll_high` when active + `needsBroll`. Client body never supplies provider key/tier. Orchestrator allowlist enforces tier-key pairing.

**Condition:** CONTRACT freezes allowlist table; removing Wan-only guard must not become "accept any provider_key from policy without tier check."

#### 6. Tier floor — **never LTX on low** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Policy | `provider_tier = low` → Wan for B-roll only |
| Orchestrator | Reject `(ltx_broll_high, low)` even if body smuggles tier |
| Activate | Phase B `active = true` does **not** alter low-tier routing |

**Condition:** Automated regression tests in Phase B before CLOSE.

#### 7. Graceful degrade — **independence + secret hygiene** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Independence | B-roll failure never mutates primary job status/cancel |
| Secrets | Degrade uses same sanitizer / closed DTOs as US-8.5 |
| Assembly | US-9.1 Phase B skips missing B-roll (handoff — out of BUILD) |

**Condition:** CONTRACT + tests name the degrade invariants explicitly for LTX path (primary untouched; no key in error text).

#### 8. `asset_role = broll` tenancy (APPROVE)

| Rule | Detail |
|---|---|
| Adapter | `videoAssetRole: "broll"` |
| INSERT | `asset_role = broll`, `client_id` required, `provider_tier = high` |
| Retry | Stays `broll` + `ltx_broll_high` |
| Forbidden | Writing LTX as `primary`; promoting B-roll on retry |

#### 9. Prompts + reference still — **server authority** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Still | Reuse **`getBrollReferenceStillAssetForClient`** (US-8.5); fail closed |
| Prompt | LTX-specific wrapper from beats/script; client free-text not sole authority |
| Duration | Clamp ≤ 5s server-side |

#### 10. Phase split — **A adapter, B activate + orchestrator** (APPROVE)

| Phase | Security closure |
|---|---|
| A | Adapter + normalizers + mocked key/SSRF/estimate tests |
| B | Catalog activate + orchestrator unlock + tier-floor + budget/degrade/`asset_role`/clip-cap tests |

Full USER_STORIES AC requires both phases; SECURITY AC applies to both before VALIDATION sign-off.

---

## Future-Proofing Notes

- **US-9.1 Phase B stitch:** Consume only server-owned `asset_role = broll` media ids — never fetch FAL URLs at assembly time (US-9.1 SSRF floor).
- **Wan vs LTX allowlists:** Never share output host arrays across vendors; each adapter owns its CONTRACT-frozen list.
- **`FAL_API_KEY` blast radius:** Distinct from `SILICONFLOW_API_KEY` — compromise affects FAL only; ops rotation is independent.
- **Webhooks:** If FAL async callbacks are added later, require signature/secret verify + bind `(external_job_id, provider_key)` — prefer poll-only until then.
- **Catalog `capabilities.allowedOutputHosts`:** Prefer catalog mirror of LTX allowlist with adapter constant fallback for tests.
- **Multi-tenancy / US-14.5:** `client_id` on B-roll jobs + ownership checks already correct shape.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before BUILD starts, verify CONTRACT:

- [ ] `ltx-broll-high-adapter.ts` path + `server-only`; registry registers real adapter; estimate **126**
- [ ] **`FAL_API_KEY`** + `Authorization: Key` + missing-key behavior; no LTX-only env name
- [ ] **`LTX_ALLOWED_OUTPUT_HOSTS`** + `validateProviderOutputUrl` at status + fetch
- [ ] Download hardening (timeout, max bytes, redirects, Content-Type)
- [ ] Reference still: US-8.5 owned media / signed M1 — no client image URLs
- [ ] Server-authored prompt rules + forbidden client prompt-as-authority
- [ ] Mandatory normalizers for all FAL LTX JSON
- [ ] Gate order: policy → tier pairing → estimate → budget **per clip** → `createJob`
- [ ] Orchestrator allowlist `{ wan + low, ltx + high }`; tier-floor tests
- [ ] Graceful degrade: primary independence + sanitized errors
- [ ] `asset_role = broll` + `client_id` + `provider_tier = high` on INSERT; retry non-promotion
- [ ] Clip max cap; `FORBIDDEN_FIELDS` for provider_key / tier / cost drivers
- [ ] Poll-only V1 — no webhook endpoint
- [ ] Phase B activate migration for `ltx_broll_high` only
- [ ] Security test matrix (key, SSRF, budget, tier floor, degrade, tenancy, estimate 126¢)
- [ ] Explicit out-of-scope: US-9.1 stitch, FE preview, Wan changes beyond allowlist, live CI

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — **media-pipeline-engineer** (primary) and **nextjs-backend** may author `plan/stories/US-8.8/CONTRACT.md`. **Reviewed by FE: N/A**. Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **`FAL_API_KEY` server-only** + redaction (incl. degrade); (2) **`LTX_ALLOWED_OUTPUT_HOSTS`** + download-and-own; (3) **mandatory normalizers**; (4) **per-clip budget vs US-7.1 at 126¢**; (5) **no client `provider_key` / tier smuggling**; (6) **tier floor — never LTX on low**; (7) **graceful degrade independence + no secret leak**; (8) **`asset_role = broll` tenancy**; (9) **server-resolved still + server-authored prompt**; (10) security test matrix |
| **REDESIGN** | CONTRACT allows client-authoritative `provider_key` / tier / image URL / sole free-form prompt; persists CDN as canonical; omits allowlist; skips per-clip budget; couples primary failure to B-roll; writes LTX as `primary`; reuses Wan output hosts |
| **VETO (do not BUILD)** | Client Component imports LTX adapter; `fetch(userSuppliedUrl)` without allowlist; key in DTOs/logs; webhook without signature; orchestrator accepts LTX on low tier; degrade path logs raw FAL bodies |

### Conditions before BUILD (binding — condition count = 13)

1. **Anti–API-key-leakage:** `FAL_API_KEY` env-only in LTX adapter; `Authorization: Key`; sanitize; closed DTOs; no key in logs/errors/responses (including degrade).
2. **Anti–SSRF (output):** FAL/LTX host allowlist + `validateProviderOutputUrl` + redirect re-validation.
3. **Anti–SSRF (input):** owned reference still via US-8.5 signed M1 / resolver only — no client absolute image URLs.
4. **Anti–untrusted-response:** US-8.1 normalizers on all FAL LTX JSON; opaque ids; enum status; sanitized errors.
5. **Anti–CDN-as-canonical:** download-and-own; `rawOutputUrl` non-persistent.
6. **Anti–budget-bypass:** server 126¢/`per_clip` estimate; `assertReelBudgetAllowsSpend` before each clip create; clip max cap.
7. **Anti–provider smuggling:** forbid client `provider_key` / tier / cost drivers; policy + allowlist owns key-tier pairing.
8. **Anti–tier-floor bypass:** never `(ltx_broll_high, low)`; policy + tests; activation does not change low routing.
9. **Anti–prompt authority:** server-authored prompts from beats/script; client free-text not sole authority.
10. **Anti–degrade primary coupling:** B-roll failure never fails/cancels/blocks primary.
11. **Anti–degrade secret leak:** degrade/failure surfaces use sanitized errors only.
12. **Anti–`asset_role` / tenancy confusion:** always `broll` + `client_id` + `high` tier; retry non-promotion; IDOR 404.
13. **Anti–module-leak:** `server-only`; LTX HTTP under `lib/providers/**`; poll-only (no unauthenticated webhook).

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any REDESIGN finding blocks BUILD until CONTRACT revision.

---

## CONTRACT freeze list (binding summary)

1. **Secrets:** `FAL_API_KEY` server-only; `Authorization: Key` header; never in DB/DTOs/logs/degrade panels.
2. **SSRF:** `LTX_ALLOWED_OUTPUT_HOSTS` + validate before fetch; inputs from owned stills only (US-8.5 resolver).
3. **Responses:** Normalizers + sanitize; no raw vendor persistence.
4. **Budget:** 126¢ per clip × N; assert before each create; cap N; count against Reel cumulative (US-7.1).
5. **Authority:** No client `provider_key` / tier / cost drivers / sole free-form prompt; allowlist tier-key pairing.
6. **Tier floor:** Low tier → Wan only; LTX never silent default.
7. **Degrade:** Primary independent; sanitized errors on B-roll failure (US-8.5 parity).
8. **Tenancy:** `asset_role = broll` + `client_id` + `provider_tier = high`; retry stays B-roll + LTX.
9. **Ownership:** Download-and-own Storage; poller-only status writes.
10. **Duration:** Clamp ≤ 5s server-side.
11. **Tests:** Key, SSRF, budget 126¢, tier floor, degrade independence + non-leak, tenancy, `server-only`.

---

## BUILD vetoes (summary)

1. **`FAL_API_KEY` in Client Component bundle, API response, job DTO, catalog secret column, or unsanitized degrade/error text.**
2. **`fetchAsset` / `getJobStatus` fetching URL without `validateProviderOutputUrl` + LTX allowlist.**
3. **I2V image from client-supplied absolute URLs.**
4. **Persisting raw FAL JSON, raw status strings, or CDN `rawOutputUrl` as canonical output.**
5. **`createJob` without preceding per-clip budget gate at 126¢.**
6. **Client-supplied `provider_key` / `tier` / cost drivers accepted as authority.**
7. **Client free-text accepted as sole LTX prompt authority.**
8. **B-roll failure/cancel/block of talking-head `primary`.**
9. **LTX jobs INSERT with `asset_role = primary` or without `client_id`.**
10. **Orchestrator accepting `ltx_broll_high` when `provider_tier = low`.**
11. **B-roll retry that converts to `primary` / HeyGen / Wan without audited Operator path.**
12. **`getVideoAdapter(` with request-derived `providerKey`.**
13. **FAL webhook Route Handler without signature verification (prefer: no webhook in V1).**
14. **Missing security tests for key redaction (incl. degrade), SSRF rejection, budget-per-clip at 126¢, tier floor, primary independence, and `asset_role = broll` tenancy.**

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — not REDESIGN because US-8.8 correctly **extends** the proven US-8.5 Wan B-roll pattern to **FAL LTX** for **`asset_role = broll`** at **high tier only**, with PO freezes already aligned to the security floor (dedicated env key, download-and-own, graceful degrade, catalog 126¢, no client provider authority, tier floor, stitch deferred). Incremental risk vs Wan is **`FAL_API_KEY` hygiene** (distinct auth header shape), **FAL-specific SSRF allowlist** (must not reuse Wan hosts), **6× higher per-clip spend** (budget gate critical), **tier-floor bypass on catalog activation**, and **degrade paths that forget sanitization** — all manageable when the **13 conditions** above are CONTRACT-frozen and testable.

**Recommended action:** Proceed to **CONTRACT.md** with **media-pipeline-engineer** + **nextjs-backend**; security-architect post-CONTRACT spot-check expected **APPROVE WITH CONDITIONS** when the freeze list is encoded.

---

## Gate summary

| Field | Value |
|---|---|
| **Verdict** | **APPROVE WITH CONDITIONS** |
| **Condition count** | **13** |
| **Veto** | No |
| **Next gate** | CONTRACT.md |
