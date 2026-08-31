# US-8.8 — LTX B-roll adapter (high tier, P1)

**Priority:** P1  
**Depends on:** US-8.1 ✅ adapter interface + registry · US-7.2 ✅ policy high-tier B-roll routing · US-X.4 ✅ catalog seed (inactive, 126¢ `per_clip`, `FAL_API_KEY`, `ltx-2.3-pro`) · US-8.4 ✅ job table + poller · US-8.5 ✅ `createBrollVideoJobs` + Wan adapter + graceful degrade · US-7.1 ✅ budget. **Soft:** US-5.1 (`broll_beats` / `modalidad`) · US-9.1 Phase B ✅ (stitch consumer). **Pattern:** US-8.5 Wan · US-8.7 catalog activate.  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-8.8 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** (`docs/development/AGENT-ROSTER.md` Phase 4). **Reviewed by FE: N/A** — preview strip deferred.  
**Canonical terms:** **provider adapter** · **provider key** · **provider tier** · **asset role (`broll`)** · **external job id** · **download-and-own** · **graceful degrade**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-9.1 Phase B** FFmpeg multi-clip stitch — already CLOSED; consume owned clips only.
- **Optional FE B-roll preview / generate strip** — deferred; no FE AC.
- **Low-tier Wan orchestrator changes** beyond shared allowlist generalization.
- **Operator fallback UI** — LTX is policy-driven (unlike US-8.7 HeyGen).
- **HeyGen / ElevenLabs** high-tier adapters.
- **New `neuramark_video_jobs` DDL** — reuse US-8.4 / US-8.5 columns.
- **Live FAL CI tests** — mocked HTTP only.
- **Client-supplied `provider_key` / free-form prompt as sole create authority**.
- **Rename provider_key** — use **`ltx_broll_high`** only.

## Scope split

| Concern | Owner |
|---------|--------|
| Real `ltx_broll_high` `VideoProviderAdapter` (FAL LTX API) | **US-8.8 Phase A** BE / media |
| `lib/contracts/ltx-broll-high.ts` constants | **US-8.8 Phase A** BE |
| Registry: register `createLtxBrollHighAdapter` when catalog row present | **US-8.8 Phase A** BE |
| `estimateCost` from catalog `per_clip` / **126¢** | **US-8.8 Phase A** BE |
| `createJob` / `getJobStatus` / `fetchAsset` + US-8.1 normalizers | **US-8.8 Phase A** BE |
| Mocked-HTTP adapter tests + registry regression | **US-8.8 Phase A** BE |
| Activate catalog `ltx_broll_high` | **US-8.8 Phase B** DB |
| Extend `createBrollVideoJobs` for high-tier LTX (remove Wan-only guard) | **US-8.8 Phase B** BE |
| Provider-specific prompt helper (LTX vs Wan) | **US-8.8 Phase B** BE |
| Poller / retry parity for LTX B-roll jobs | **US-8.8 Phase B** BE (verify US-8.4 / US-8.5 paths) |
| Policy `resolveProviderForJob` high-tier B-roll | **US-7.2** ✅ (verify with tests after activate) |
| Multi-clip stitch | **US-9.1 Phase B** ✅ (handoff) |
| FE preview strip | **Deferred** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-8.8-ltx-broll-high`** |
| Module | **`lib/providers/video/ltx-broll-high-adapter.ts`** (`import "server-only"`) |
| Constants | **`lib/contracts/ltx-broll-high.ts`** — mirror `siliconflow-wan21-turbo.ts` shape |
| Factory | **`createLtxBrollHighAdapter(params)`** — catalog-driven estimate |
| Provider key | **`ltx_broll_high`** · **`videoAssetRole: broll`** |
| Env | **`FAL_API_KEY`** via `process.env[envKeyName]`; missing → **`PROVIDER_CONFIG_MISSING`** |
| Vendor API | **FAL** — model **`ltx-2.3-pro`** (seed metadata) — CONTRACT freezes submit/status/fetch URLs + body |
| Duration | Clamp to **≤ 5s**; policy band **3–5s**; default lean **5s** |
| `estimateCost` | **`per_clip` × clipCount**; seed **`unitCostCents: 126`** (~$1.26) |
| Catalog activate | **Phase B migration** `active = true` (cost_model unchanged unless CONTRACT corrects) |
| Low tier | **Never** resolves `ltx_broll_high`; Wan unchanged |
| High tier | Policy selects `ltx_broll_high` when tier=`high`, row active, `needsBroll` |
| Orchestrator | Extend **`createBrollVideoJobs`** — allow `{ siliconflow_wan21_turbo, low }` **or** `{ ltx_broll_high, high }` |
| Graceful degrade | B-roll failure **never** blocks / fails primary talking-head |
| Multi-clip | N jobs from `brollBeats` (max lean **8**, shared cap with Wan) |
| Inputs | Server-resolved **image** + server-authored **prompt** from beat/script (I2V) |
| Consent | **Not** required for B-roll |
| Budget | Per-clip estimate + **`assertReelBudgetAllowsSpend`** before each create |
| FE | **Defer** preview strip; **Reviewed by FE: N/A** |
| Implementers | media-pipeline-engineer + nextjs-backend |

### Catalog row (US-X.4 seed — Phase B target)

| Field | Value |
|-------|-------|
| `key` | `ltx_broll_high` |
| `asset_role` | `broll` |
| `tier` | `high` |
| `active` | **`true`** (Phase B migration; seed **`false`**) |
| `env_key_name` | `FAL_API_KEY` |
| `capabilities` | `{}` |
| `cost_model` | `{ "billingUnit": "per_clip", "unitCostCents": 126, "metadata": { "clipDurationSec": 5, "model": "ltx-2.3-pro" } }` |

### Trigger matrix (CONTRACT freezes)

| Condition | LTX B-roll create? |
|-----------|---------------------|
| `provider_tier = high` + `needsBroll` + row active + budget OK | **Yes** (policy → `ltx_broll_high`) |
| `provider_tier = low` + `needsBroll` | **No LTX** — Wan only (US-8.5 ✅) |
| `provider_tier = high` + row inactive (pre-Phase B) | **No** — `BROLL_PROVIDER_UNAVAILABLE` |
| Talking-head primary create | **Independent** — never waits on B-roll |
| B-roll job fails / times out | Primary **continues**; B-roll row `failed` |
| Client body `provider_key` | **Reject** (`FORBIDDEN_FIELDS`) |

### Adapter method sketch (CONTRACT freezes exact signatures)

```ts
// lib/providers/video/ltx-broll-high-adapter.ts
export function createLtxBrollHighAdapter(params: {
  defaultEstimateCents: number; // 126 from catalog bootstrap
  unitCostCentsPerClip?: number;
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "image" | "portrait",
  ) => Promise<string>;
  uploadGeneratedVideo?: (args: UploadGeneratedVideoArgs) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
  initialJobContexts?: Map<ExternalJobId, JobContext>;
}): VideoProviderAdapter;
```

### FAL createJob flow (Phase A BUILD)

```ts
// 1. Validate env FAL_API_KEY
// 2. Validate reference image asset id + server prompt / duration ≤ 5s
// 3. Resolve image → HTTPS URL (owned media only; MIME allowlist)
// 4. POST FAL LTX endpoint (CONTRACT freezes path + body for ltx-2.3-pro)
// 5. Return { externalJobId, status: "queued", estimatedCostCents: 126 }
```

### Registry registration (Phase A BUILD)

```ts
// lib/providers/create-provider-registry.ts
import { createLtxBrollHighAdapter } from "@/lib/providers/video/ltx-broll-high-adapter";

// Register when catalogKeys.has("ltx_broll_high") — mirror musetalk/manual pattern
// estimateCentsFromCatalog(..., "ltx_broll_high", 126)
```

### Orchestrator extension (Phase B BUILD)

```ts
// lib/video-jobs/create-broll-video-jobs.ts
// REMOVE hard guard:
//   if (providerKey !== WAN_PROVIDER_KEY || providerTier !== "low") { ... }
// REPLACE with allowlist:
//   (providerKey === WAN_PROVIDER_KEY && providerTier === "low")
//   || (providerKey === LTX_PROVIDER_KEY && providerTier === "high")
// Generalize prompt builder — buildLtxBrollPrompt vs buildWanBrollPrompt
// Retry path: inherit parent provider_key when asset_role = broll (verify US-8.5 retry)
```

## Carry-forwards / reuse (do not reinvent)

- **No stub today** — ship real adapter directly (unlike Wan/HeyGen stub swap).
- Interface: `lib/providers/provider-adapters.ts` — **`VideoProviderAdapter`**.
- Wan adapter: `lib/providers/video/siliconflow-wan21-turbo-adapter.ts` — **mirror** structure.
- Orchestrator: `lib/video-jobs/create-broll-video-jobs.ts` — **extend** (L188–190 Wan-only guard is the gap).
- Policy: `lib/providers/resolve-provider-for-job.ts` — high-tier B-roll rationale already `"cheapest_active_high_tier"`.
- Display label: `resolve-provider-display-label.ts` — **`ltx_broll_high: "LTX B-roll"`** already seeded.
- HeyGen activate migration: `20260831080000_neuramark_heygen_high_activate.sql` — **mirror** for LTX (no audit table).
- Security baseline: `plan/SECURITY_BASELINE.md` § Video Provider; US-8.5 SECURITY.md patterns.

---

## FE checklist

Concrete consumer: **none in this story** (optional preview strip **deferred**).

- [ ] **Deferred:** Operator B-roll preview strip on Reel detail (EN/ES) — follow-up.
- [ ] **Note:** `/operator/scripts` may continue filtering `asset_role = primary` — **not blocking CLOSE**.

**Reviewed by FE: N/A**

---

## BE checklist

Concrete consumers: **`createBrollVideoJobs`** · US-8.4 poller · **`estimateVideoJobCost()`** / policy estimates · US-9.1 assembly input resolver.

### Phase A — LTX adapter

- [x] **`lib/contracts/ltx-broll-high.ts`** — env key, FAL API paths, model id `ltx-2.3-pro`, duration caps, MIME/host allowlists, fetch limits.
- [x] **`lib/providers/video/ltx-broll-high-adapter.ts`** — implement **`VideoProviderAdapter`** for **`ltx_broll_high`** / **`broll`**.
- [x] **`estimateCost`** — **126¢** × clipCount (default 1); from catalog / projection.
- [x] **`createJob`** — validate image + prompt + duration clamp; POST FAL LTX; return opaque `externalJobId`.
- [x] **`getJobStatus`** — poll FAL; **`normalizeVideoJobStatusResult`**; allowlisted `rawOutputUrl` only when terminal.
- [x] **`fetchAsset`** — **`validateProviderOutputUrl`** → download → Storage → **`storedMediaAssetSchema`**; job context map for poller L1.
- [x] **Registry** — register **`createLtxBrollHighAdapter`** when catalog contains `ltx_broll_high`; bootstrap estimate **126**.
- [x] **[SEC] `server-only`**; token never logged/returned; untrusted JSON sanitized; FAL output URL allowlist; opaque **`external_job_id`**.
- [x] **`lib/providers/video/ltx-broll-high-adapter.test.ts`** — mocked HTTP round-trip; missing env; duration clamp; sanitized errors; estimate **126**.
- [x] **Update registry / policy tests** — `getVideoAdapter("ltx_broll_high")` when row present; high + needsBroll selects LTX **after** activate.

### Phase B — Activate catalog + orchestrator unlock

- [x] **Migration** — `UPDATE neuramark_provider_catalog SET active = true WHERE key = 'ltx_broll_high'`.
- [x] **Remove Wan-only guard** in `create-broll-video-jobs.ts`; allow LTX high path.
- [x] **`buildLtxBrollPrompt`** (or CONTRACT name) — server-authored from beats; injection floor.
- [x] **Job INSERT** — `provider_key = ltx_broll_high`, `provider_tier = high`, **`asset_role = broll`**, spend event per clip.
- [x] **Budget** — `assertReelBudgetAllowsSpend` per clip; over-budget skips **that** clip without aborting primary.
- [x] **Graceful degrade** — tests: primary succeeds when LTX create/poll fails (mirror US-8.5).
- [x] **Reject** client `provider_key` / tier / raw unbounded prompt fields.
- [x] **Poller** — verify B-roll LTX jobs picked up (provider-agnostic poller).
- [x] **Retry** — B-roll retry stays `asset_role = broll` + inherits LTX parent provider.
- [x] **Orchestrator tests** — high + needsBroll → LTX · low + needsBroll → Wan only · N clips · budget block · degrade · non-operator 403.
- [x] **Policy regression** — `resolveProvider(..., { tier: "high", assetRole: "broll" })` returns `ltx_broll_high` after activate.

---

## DB checklist

All objects keep `neuramark_` prefix.

- [x] **Activate migration** — `ltx_broll_high.active = true` (Phase B).
- [x] **No DDL** on `neuramark_video_jobs` unless CONTRACT finds a gap.
- [x] RLS deny-by-default unchanged; service-role Node only.
- [x] No secrets in catalog rows — `env_key_name` only.

---

## Media / provider checklist

- [x] FAL LTX HTTP only under `lib/providers/**` (except tests).
- [x] **`videoAssetRole: "broll"`** on adapter — never `primary`.
- [x] Download-and-own storage key shape flat **`{uuid}.mp4`** per US-8.5 CONTRACT amendment.
- [x] Poller L1 job context map parity with Wan.
- [x] Duration clamp **≤ 5s** enforced server-side.
- [x] Cost estimate uses catalog **126¢**/clip.

---

## Tests checklist

- [x] Adapter mocked HTTP: create → poll → fetchAsset happy path.
- [x] Missing `FAL_API_KEY` → `PROVIDER_CONFIG_MISSING`.
- [x] Estimate: 1 clip = **126¢**; 3 clips = **378¢**.
- [x] Duration > 5s clamped (lean: **clamp**).
- [x] Output host reject (SSRF).
- [x] Policy: `provider_tier=high` + `needsBroll` + active → `ltx_broll_high`.
- [x] Policy: `provider_tier=low` + `needsBroll` → **never** `ltx_broll_high`.
- [x] Degrade: primary job succeeds when LTX adapter throws / status `failed`.
- [x] Budget: B-roll blocked does not mark primary failed.
- [x] Job rows persist **`asset_role = broll`** + **`provider_key = ltx_broll_high`**.
- [x] **`retryVideoJob`** LTX B-roll parent retry via `isAllowedBrollProviderPair` — `video-jobs.test.ts` (fix `4584573`).

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — **GAPS**)
- [x] SECURITY.md (security-architect — APPROVE WITH CONDITIONS)
- [x] CONTRACT.md authored (nextjs-backend; **Reviewed by FE: N/A**)
- [x] BUILD Phase A (media-pipeline-engineer + nextjs-backend) — `5aa1392`
- [x] BUILD Phase B (BE orchestrator + DB activate) — `4835f2d`
- [x] QA fix retry parity — `4584573` (`isAllowedBrollProviderPair` in `retry-video-job.ts` + `video-jobs.test.ts`)
- [x] VALIDATION.md (requirements-validator) — PASS WITH NOTES (7/7 AC)
- [x] QA.md (qa-engineer) — initial REJECT → re-verdict APPROVE after `4584573`
- [x] CLOSE — 7/7 AC checked in USER_STORIES.md (product-owner)

**Status:** CLOSED (2026-08-31). **Next:** FF-merge to main.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Exact FAL model endpoint for `ltx-2.3-pro`?** **PO lean:** CONTRACT freezes against FAL docs (async queue + poll) — mirror Wan async shape; auth via `Authorization: Key ${FAL_API_KEY}` or FAL-documented header.
2. **Reference still source when faceless?** **PO lean:** reuse **`getBrollReferenceStillAssetForClient`** (US-8.5) — same resolver for Wan and LTX.
3. **Prompt authorship?** **PO lean:** LTX-specific wrapper strings in constants module; build from `brollBeats[i]` server-side.
4. **Max clips per Reel?** **PO lean:** **8** — share `clampWanClipCount` or rename to shared `clampBrollClipCount` in CONTRACT.
5. **Shared orchestrator constants?** **PO lean:** extract provider-agnostic clip cap / duration clamp to `lib/contracts/broll-shared.ts` only if CONTRACT proves duplication — otherwise minimal branch in orchestrator.
6. **Partial CLOSE after Phase A?** **PO lean:** **no** — high-tier routing AC requires Phase B activate + orchestrator unlock.
7. **Should registry bootstrap include inactive LTX for offline tests?** **PO lean:** register adapter when catalog row exists regardless of `active`; policy filters `active` at resolve time (US-X.4 pattern).

No SPEC amendment assumed in PREP: SPEC §3 requires swappable video adapters; LTX is the documented high-tier B-roll provider per US-7.2 / US-X.4.
